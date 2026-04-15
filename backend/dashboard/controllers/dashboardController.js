const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Leave = require('../../leaves/model/Leave');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');
const OD = require('../../leaves/model/OD');
const Permission = require('../../permissions/model/Permission');
const LeaveRegisterYear = require('../../leaves/model/LeaveRegisterYear');
const dateCycleService = require('../../leaves/services/dateCycleService');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');
const { extractISTComponents, createISTDate, getTodayISTDateString } = require('../../shared/utils/dateUtils');

function addCalendarDaysIST(dateStr, delta) {
  const base = createISTDate(dateStr, '12:00');
  return extractISTComponents(new Date(base.getTime() + delta * 86400000)).dateStr;
}

function istSundayWeekStart(dateStr) {
  const ref = createISTDate(dateStr, '12:00');
  const short = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(ref);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = map[short] ?? 0;
  return addCalendarDaysIST(dateStr, -wd);
}

function normalizeEmpNos(employees) {
  return [...new Set(
    employees.map((e) => String(e.emp_no || '').trim().toUpperCase()).filter(Boolean)
  )];
}

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
    let user = await User.findById(userId);
    /** JWT may reference an Employee record (same as GET /auth/me). */
    let employeeDirect = null;

    if (!user) {
      employeeDirect = await Employee.findById(userId).select('emp_no employee_name').lean();
      if (!employeeDirect) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }
    }

    const role = user ? user.role : 'employee';
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
        status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] },
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
          status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] },
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
          status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] },
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
          status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] }
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

    // 4. Employee - Personal Stats (User with employee link OR Employee login)
    else {
      let employeeIdStr;
      let empMongoId;

      if (employeeDirect) {
        employeeIdStr = employeeDirect.emp_no;
        empMongoId = employeeDirect._id;
      } else {
        employeeIdStr = user.employeeId;
        empMongoId = user.employeeRef || req.user?.employeeRef;
        if (!empMongoId && user.employeeId) {
          const e = await Employee.findOne({ emp_no: user.employeeId }).select('_id compensatoryOffs').lean();
          empMongoId = e?._id;
        }
      }

      if (!employeeIdStr) {
        return res.json({ success: true, data: {} });
      }

      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfMonthStr = toDateStr(startOfMonth);

      const empNoUpper = String(employeeIdStr).trim().toUpperCase();
      const leaveOr = [{ emp_no: employeeIdStr }, { emp_no: empNoUpper }];
      if (empMongoId) {
        leaveOr.push({ employeeId: empMongoId });
      }

      const myPendingLeaves = await Leave.countDocuments({
        status: 'pending',
        $or: leaveOr,
      });
      const myApprovedLeaves = await Leave.countDocuments({
        status: 'approved',
        $or: leaveOr,
      });

      const myAttendance = await AttendanceDaily.countDocuments({
        employeeNumber: empNoUpper,
        date: { $gte: startOfMonthStr, $lte: todayStr },
        status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] }
      });

      const leaveBalance = myApprovedLeaves - myPendingLeaves;

      let compensatoryOffBalance = null;
      let yearlyClCreditDaysPosted = null;
      let yearlyCclCreditDaysPosted = null;
      let financialYearRegister = null;

      if (empMongoId) {
        const fy = await dateCycleService.getFinancialYearForDate(today);
        financialYearRegister = fy.name;
        const yDoc = await LeaveRegisterYear.findOne({
          employeeId: empMongoId,
          financialYear: fy.name,
        })
          .select(
            'compensatoryOffBalance yearlyClCreditDaysPosted yearlyCclCreditDaysPosted financialYear'
          )
          .lean();
        if (yDoc) {
          compensatoryOffBalance = Number(yDoc.compensatoryOffBalance) || 0;
          yearlyClCreditDaysPosted = Number(yDoc.yearlyClCreditDaysPosted) || 0;
          yearlyCclCreditDaysPosted = Number(yDoc.yearlyCclCreditDaysPosted) || 0;
        } else {
          const empSnap = await Employee.findById(empMongoId).select('compensatoryOffs').lean();
          compensatoryOffBalance = Number(empSnap?.compensatoryOffs) || 0;
          yearlyClCreditDaysPosted = 0;
          yearlyCclCreditDaysPosted = 0;
        }
      }

      stats = {
        myPendingLeaves,
        myApprovedLeaves,
        todayPresent: myAttendance,
        upcomingHolidays: 2,
        leaveBalance,
        compensatoryOffBalance,
        yearlyClCreditDaysPosted,
        yearlyCclCreditDaysPosted,
        financialYearRegister,
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

    const todayStr = getTodayISTDateString();
    const yesterdayStr = addCalendarDaysIST(todayStr, -1);
    const currentCycle = await dateCycleService.getPayrollCycleForDate(new Date());
    const prevMonthDate = new Date(currentCycle.startDate);
    prevMonthDate.setDate(prevMonthDate.getDate() - 15); // middle of prev cycle
    const previousCycle = await dateCycleService.getPayrollCycleForDate(prevMonthDate);

    const cycleStart = currentCycle.startDate;
    const cycleEnd = currentCycle.endDate;
    const prevCycleStart = previousCycle.startDate;
    const prevCycleEnd = previousCycle.endDate;

    const startOfToday = createISTDate(todayStr, '00:00');
    const endOfToday = createISTDate(todayStr, '23:59');
    const startOfYesterday = createISTDate(yesterdayStr, '00:00');
    const endOfYesterday = createISTDate(yesterdayStr, '23:59');

    const weekAgoDate = createISTDate(addCalendarDaysIST(todayStr, -7), '00:00');
    const twoWeeksAgoDate = createISTDate(addCalendarDaysIST(todayStr, -14), '00:00');

    const trendPct = (current, previous) => {
      if (previous === 0) return current === 0 ? 0 : 100;
      return Math.round(((current - previous) / previous) * 100);
    };

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
      pendingPermissions,
      pendingApplications,
      monthlyPresentDocs,
      allLeaves,
      allODs,
      newEmployeesThisMonth,
      newEmployeesLastMonth,
      resignedThisMonth,
      resignedLastMonth,
      yesterdayOnLeaveCount,
      yesterdayODsCount,
      applicationsThisWeek,
      applicationsPrevWeek,
      onLeaveTodayRaw,
      pendingSalaryVerification,
      leaveTypeDistRaw,
      deptHeadcountRaw,
      birthdayEmployees,
    ] = await Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments(Employee.getCurrentlyActiveFilter()),
      Department.countDocuments(),
      User.countDocuments(),

      // Today present - using string date
      AttendanceDaily.countDocuments({
        date: todayStr,
        $or: [
          { status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] } },
          { inTime: { $ne: null } },
          { "shifts.inTime": { $ne: null } }
        ]
      }),
      // Today absent
      AttendanceDaily.countDocuments({
        date: todayStr,
        status: 'ABSENT'
      }),

      // Yesterday present
      AttendanceDaily.countDocuments({
        date: yesterdayStr,
        $or: [
          { status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] } },
          { inTime: { $ne: null } },
          { "shifts.inTime": { $ne: null } }
        ]
      }),
      // Yesterday absent
      AttendanceDaily.countDocuments({
        date: yesterdayStr,
        status: 'ABSENT'
      }),

      // Pending counts filtered by current payroll cycle (matching Leave/OD management pages)
      Leave.countDocuments({ 
        status: { $nin: ['approved', 'rejected', 'cancelled'] },
        fromDate: { $lte: cycleEnd },
        toDate: { $gte: cycleStart },
        isActive: true
      }),
      OD.countDocuments ? OD.countDocuments({ 
        status: { $nin: ['approved', 'rejected', 'cancelled'] },
        fromDate: { $lte: cycleEnd },
        toDate: { $gte: cycleStart },
        isActive: true
      }).catch(() => 0) : Promise.resolve(0),
      Permission.countDocuments ? Permission.countDocuments({ 
        status: { $nin: ['approved', 'rejected', 'cancelled'] },
        fromDate: { $lte: cycleEnd },
        toDate: { $gte: cycleStart },
        isActive: true
      }).catch(() => 0) : Promise.resolve(0),
      EmployeeApplication.countDocuments({ 
        status: { $nin: ['approved', 'rejected', 'cancelled'] },
        createdAt: { $gte: cycleStart, $lte: cycleEnd },
        isActive: true
      }),

      // Cycle present count (replaces Monthly to match Leave/OD Page)
      AttendanceDaily.countDocuments({
        date: { $gte: extractISTComponents(cycleStart).dateStr, $lte: todayStr },
        status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] }
      }),

      // Active leave approvals today
      Leave.find({
        status: 'approved',
        fromDate: { $lte: endOfToday },
        toDate: { $gte: startOfToday },
        isActive: true
      }).populate('department', 'name'),

      OD.find ? OD.find({
        status: 'approved',
        fromDate: { $lte: endOfToday },
        toDate: { $gte: startOfToday },
        isActive: true
      }).populate('department', 'name').catch(() => []) : Promise.resolve([]),

      Employee.countDocuments({
        doj: { $gte: cycleStart, $lte: endOfToday },
      }),
      Employee.countDocuments({
        doj: { $gte: prevCycleStart, $lte: prevCycleEnd },
      }),
      Employee.countDocuments({
        leftDate: { $gte: cycleStart, $lte: endOfToday },
      }),
      Employee.countDocuments({
        leftDate: { $gte: prevCycleStart, $lte: prevCycleEnd },
      }),
      Leave.countDocuments({
        status: 'approved',
        fromDate: { $lte: endOfYesterday },
        toDate: { $gte: startOfYesterday },
        isActive: true
      }),
      OD.countDocuments ? OD.countDocuments({
        status: 'approved',
        fromDate: { $lte: endOfYesterday },
        toDate: { $gte: startOfYesterday },
        isActive: true
      }).catch(() => 0) : Promise.resolve(0),
      EmployeeApplication.countDocuments({ createdAt: { $gte: weekAgoDate } }),
      EmployeeApplication.countDocuments({
        createdAt: { $gte: twoWeeksAgoDate, $lt: weekAgoDate },
      }),
      Leave.find({
        status: 'approved',
        fromDate: { $lte: endOfToday },
        toDate: { $gte: startOfToday },
        isActive: true
      })
        .populate('employeeId', 'employee_name profilePhoto emp_no')
        .sort({ toDate: 1 })
        .limit(18)
        .lean(),
      Employee.countDocuments({ salaryStatus: 'pending_approval' }),
      // New: Leave type distribution for current month
      Leave.aggregate([
        {
          $match: {
            status: 'approved',
            fromDate: { $gte: cycleStart },
            isActive: true
          }
        },
        { $group: { _id: '$leaveType', count: { $sum: 1 } } }
      ]),
      // New: Department headcount distribution
      Employee.aggregate([
        { $match: Employee.getCurrentlyActiveFilter() },
        {
          $group: {
            _id: '$department_id',
            count: { $sum: 1 }
          }
        }
      ]),
      // Upcoming Birthdays (Next 30 Days)
      Employee.find({
        ...Employee.getCurrentlyActiveFilter(),
        dob: { $ne: null }
      }).select('employee_name emp_no dob profilePhoto department_id division_id')
        .populate('department_id', 'name')
        .populate('division_id', 'name')
        .lean(),
    ]);

    // Process Upcoming Birthdays (JS filtering for cross-year logic)
    const upcomingBirthdays = (birthdayEmployees || []).map(emp => {
      const bDate = new Date(emp.dob);
      const today = new Date(startOfToday);
      
      // Legally accurate age calculation
      let age = today.getFullYear() - bDate.getFullYear();
      const m = today.getMonth() - bDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
        age--;
      }

      // Calculate next occurrence
      let nextBday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
      if (nextBday < today) {
        nextBday.setFullYear(today.getFullYear() + 1);
      }
      
      const diffTime = nextBday.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let label = null;
      if (diffDays === 0) label = "Today";
      else if (diffDays === 1) label = "Tomorrow";

      return {
        id: emp._id,
        name: emp.employee_name,
        empNo: emp.emp_no,
        dob: emp.dob,
        age,
        label,
        nextBirthday: nextBday,
        daysUntil: diffDays,
        photo: emp.profilePhoto,
        department: emp.department_id,
        division: emp.division_id
      };
    })
    .filter(b => b.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

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

    // Process Leave Type Distribution
    const leaveTypeDist = {};
    (leaveTypeDistRaw || []).forEach(item => {
      leaveTypeDist[item._id] = item.count;
    });

    // Process Department Headcount
    const deptsMeta = await Department.find({ _id: { $in: (deptHeadcountRaw || []).map(d => d._id) } }).select('name').lean();
    const deptIdToName = Object.fromEntries(deptsMeta.map(d => [String(d._id), d.name]));
    const departmentHeadcount = (deptHeadcountRaw || []).map(item => ({
      name: deptIdToName[String(item._id)] || 'Unknown',
      count: item.count
    })).sort((a, b) => b.count - a.count);

    const trackerPeriodRaw = String(req.query.trackerPeriod || 'week').toLowerCase();
    const trackerPeriod = ['week', 'month', 'lastmonth'].includes(trackerPeriodRaw)
      ? trackerPeriodRaw
      : 'week';

    const enumerateDateStrRange = (fromStr, toStr) => {
      const out = [];
      let ds = fromStr;
      while (ds <= toStr) {
        out.push(ds);
        ds = addCalendarDaysIST(ds, 1);
      }
      return out;
    };

    const fetchDayTrackerBuckets = async (ds) => {
      const dayStart = createISTDate(ds, '00:00');
      const dayEnd = createISTDate(ds, '23:59');
      const [present, leave, od] = await Promise.all([
        AttendanceDaily.countDocuments({ 
          date: ds, 
          $or: [
            { status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] } },
            { inTime: { $ne: null } },
            { "shifts.inTime": { $ne: null } }
          ]
        }),
        Leave.countDocuments({
          status: 'approved',
          fromDate: { $lte: dayEnd },
          toDate: { $gte: dayStart },
        }),
        OD.countDocuments({ status: 'approved', fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } }).catch(() => 0),
      ]);
      return { present, leave, od };
    };

    let weeklyTracker;
    if (trackerPeriod === 'week') {
      const weekStartStr = istSundayWeekStart(todayStr);
      const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      weeklyTracker = await Promise.all(
        [...Array(7)].map(async (_, i) => {
          const ds = addCalendarDaysIST(weekStartStr, i);
          const b = await fetchDayTrackerBuckets(ds);
          return { label: weekLabels[i], date: ds, ...b };
        })
      );
    } else if (trackerPeriod === 'month') {
      const dayStrs = enumerateDateStrRange(extractISTComponents(cycleStart).dateStr, todayStr);
      weeklyTracker = await Promise.all(
        dayStrs.map(async (ds) => {
          const b = await fetchDayTrackerBuckets(ds);
          const dayNum = parseInt(ds.slice(8, 10), 10);
          return { label: String(dayNum), date: ds, ...b };
        })
      );
    } else {
      const dayStrs = enumerateDateStrRange(extractISTComponents(prevCycleStart).dateStr, extractISTComponents(prevCycleEnd).dateStr);
      weeklyTracker = await Promise.all(
        dayStrs.map(async (ds) => {
          const b = await fetchDayTrackerBuckets(ds);
          const dayNum = parseInt(ds.slice(8, 10), 10);
          return { label: String(dayNum), date: ds, ...b };
        })
      );
    }

    const activeFilter = Employee.getCurrentlyActiveFilter();
    const divGroups = await Employee.aggregate([
      { $match: activeFilter },
      { $group: { _id: '$division_id', count: { $sum: 1 } } },
    ]);
    const topDivGroups = divGroups.filter((g) => g._id);
    const divIdsForGauge = topDivGroups.map((g) => g._id);
    const divisionsMeta = divIdsForGauge.length
      ? await Division.find({ _id: { $in: divIdsForGauge } }).select('name').lean()
      : [];
    const divIdToName = Object.fromEntries(divisionsMeta.map((d) => [String(d._id), d.name]));

    const divisionAttendanceToday = (
      await Promise.all(
        topDivGroups.map(async (g) => {
          const divId = g._id;
          if (!divId) return null;
          const emps = await Employee.find({ division_id: divId, ...activeFilter }).select('emp_no').lean();
          const empNos = normalizeEmpNos(emps);
          const total = empNos.length;
          if (total === 0) return null;
          const present = await AttendanceDaily.countDocuments({
            date: todayStr,
            employeeNumber: { $in: empNos },
            $or: [
              { status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] } },
              { inTime: { $ne: null } },
              { "shifts.inTime": { $ne: null } }
            ]
          });
          const rate = Math.round((present / total) * 1000) / 10;
          return { name: divIdToName[String(divId)] || 'Division', present, total, rate };
        })
      )
    )
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const onLeaveEmployeesList = (onLeaveTodayRaw || []).map((l) => {
      const emp = l.employeeId;
      const name = emp?.employee_name || l.emp_no || 'Employee';
      const to = new Date(l.toDate);
      const fromDay = new Date(startOfToday);
      fromDay.setHours(0, 0, 0, 0);
      to.setHours(0, 0, 0, 0);
      const diffDays = Math.round((to.getTime() - fromDay.getTime()) / 86400000);
      const daysLeft = Math.max(1, diffDays + 1);
      return {
        id: String(l._id),
        name,
        empNo: (emp?.emp_no || l.emp_no || '').toString().toUpperCase(),
        leaveType: l.leaveType || 'Leave',
        daysLeft,
        photo: emp?.profilePhoto || null,
      };
    });

    const daysPassed = Math.max(1, Math.round((startOfToday.getTime() - cycleStart.getTime()) / 86400000) + 1);
    const attendanceRate = activeEmployees > 0 ? (monthlyPresentDocs / (activeEmployees * daysPassed)) * 100 : 0;
    const presentRateToday = activeEmployees > 0
      ? Math.round((todayPresentCount / activeEmployees) * 1000) / 10
      : 0;
    const presentRateYesterday = activeEmployees > 0
      ? Math.round((yesterdayPresentCount / activeEmployees) * 1000) / 10
      : 0;

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
      yesterdayOnLeave: yesterdayOnLeaveCount,
      yesterdayODs: yesterdayODsCount,
      pendingLeaves,
      pendingODs,
      pendingPermissions,
      pendingApplications,
      monthlyPresent: monthlyPresentDocs,
      attendanceRate: Math.min(100, attendanceRate),
      departmentLeaveDistribution: deptLeaveDist,
      departmentODDistribution: deptODDist,
      leaveTypeDistribution: leaveTypeDist,
      departmentHeadcount,
      newEmployeesThisMonth,
      newEmployeesLastMonth,
      resignedThisMonth,
      resignedLastMonth,
      trendNewEmployeesPct: trendPct(newEmployeesThisMonth, newEmployeesLastMonth),
      trendResignedPct: trendPct(resignedThisMonth, resignedLastMonth),
      trendOnLeavePct: trendPct(allLeaves.length, yesterdayOnLeaveCount),
      trendApplicationsPct: trendPct(applicationsThisWeek, applicationsPrevWeek),
      weeklyTracker,
      divisionAttendanceToday,
      onLeaveEmployeesList,
      upcomingBirthdays,
      presentRateToday,
      presentRateYesterday,
      performanceDeltaVsYesterday: Math.round((presentRateToday - presentRateYesterday) * 10) / 10,
      analyticsDateStr: todayStr,
      trackerPeriod: trackerPeriod === 'lastmonth' ? 'lastMonth' : trackerPeriod,
    };

    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, message: 'Error fetching analytics', error: error.message });
  }
};
