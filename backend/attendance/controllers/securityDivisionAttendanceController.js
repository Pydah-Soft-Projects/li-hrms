/**
 * Security Division Attendance Controller
 *
 * Provides API endpoints exclusively for Security Division & Department
 * attendance processing. Uses the dynamic engine — no hardcoded dates,
 * no hardcoded employee IDs, works for any past, current, or future
 * payroll cycle.
 *
 * Routes (all under /api/attendance/security-division/):
 *   GET  /status             – dry-run: returns employee list + shift pool without writing
 *   POST /run-engine         – run the full dynamic attendance engine (upserts AttendanceDaily)
 *   GET  /payroll-cycle      – return current / specified payroll cycle date range
 *   GET  /employees          – list all Security division / dept employees from DB
 *   GET  /shifts             – list all Security division / dept shifts from DB
 *   GET  /summary            – read already-computed AttendanceDaily summaries for a range
 */

const {
  runSecurityDivisionAttendanceEngine,
  getPayrollCycleRange,
  getSecurityDivisionEmployees,
  getSecurityDivisionShifts,
} = require('../services/securityDivisionAttendanceService');

const AttendanceDaily = require('../model/AttendanceDaily');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helper: resolve date range from query params or current payroll cycle      */
/* ─────────────────────────────────────────────────────────────────────────── */
function resolveDateRange(query) {
  let { startDate, endDate, refDate } = query;

  if (!startDate || !endDate) {
    const ref = refDate ? new Date(refDate) : new Date();
    const cycle = getPayrollCycleRange(ref);
    startDate = startDate || cycle.startDate;
    endDate = endDate || cycle.endDate;
  }
  return { startDate, endDate };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /api/attendance/security-division/payroll-cycle                        */
/*  Returns current (or refDate-based) payroll cycle start + end dates.        */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.getPayrollCycle = async (req, res) => {
  try {
    const ref = req.query.refDate ? new Date(req.query.refDate) : new Date();
    const cycle = getPayrollCycleRange(ref);
    return res.status(200).json({ success: true, data: cycle });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] getPayrollCycle error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /api/attendance/security-division/employees                            */
/*  Returns Security Division / Department employees from DB.                  */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.getEmployees = async (req, res) => {
  try {
    const { securityDiv, securityDept, employees } = await getSecurityDivisionEmployees();
    return res.status(200).json({
      success: true,
      data: {
        total: employees.length,
        divisionName: securityDiv?.name || null,
        departmentName: securityDept?.name || null,
        employees: employees.map(e => ({
          _id: e._id,
          empNo: e.emp_no || e.employeeNumber || e.customId,
          name: e.employee_name || e.displayName || e.name,
          division: e.division_id?.name || null,
          department: e.department_id?.name || null,
          designation: e.designation_id?.name || null,
          status: e.employmentStatus || e.status || 'active',
        })),
      },
    });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] getEmployees error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /api/attendance/security-division/shifts                               */
/*  Returns all Security-related shifts from DB.                               */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.getShifts = async (req, res) => {
  try {
    const securityDiv = await Division.findOne({ name: /SECURITY/i }).lean();
    const securityDept = await Department.findOne({ name: /SECURITY/i }).lean();
    const { shifts, shiftCodeMap } = await getSecurityDivisionShifts(securityDiv, securityDept);

    return res.status(200).json({
      success: true,
      data: {
        total: shifts.length,
        shifts: shifts.map(s => ({
          _id: s._id,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          gracePeriod: s.gracePeriod,
          payableShifts: s.payableShifts,
          isOvernight: s.isOvernight || false,
        })),
        shiftCodeKeys: Object.keys(shiftCodeMap),
      },
    });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] getShifts error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /api/attendance/security-division/status                               */
/*  Dry-run: returns employee count, shift pool, and date range without        */
/*  writing anything to the database.                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.getStatus = async (req, res) => {
  try {
    const { startDate, endDate } = resolveDateRange(req.query);

    const { securityDiv, securityDept, employees } = await getSecurityDivisionEmployees();
    const { shifts } = await getSecurityDivisionShifts(securityDiv, securityDept);

    return res.status(200).json({
      success: true,
      data: {
        period: { startDate, endDate },
        totalEmployees: employees.length,
        divisionName: securityDiv?.name || null,
        departmentName: securityDept?.name || null,
        totalShifts: shifts.length,
        shifts: shifts.map(s => ({
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
        })),
        employees: employees.map(e => ({
          empNo: e.emp_no || e.employeeNumber || e.customId,
          name: e.employee_name || e.displayName || e.name,
        })),
      },
    });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] getStatus error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /api/attendance/security-division/summary                              */
/*  Read already-upserted AttendanceDaily records for Security employees       */
/*  in the given date range. No engine run — just reads current DB state.      */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.getSummary = async (req, res) => {
  try {
    const { startDate, endDate } = resolveDateRange(req.query);

    const { employees } = await getSecurityDivisionEmployees();
    const empNos = employees.map(e => e.emp_no || e.employeeNumber || e.customId).filter(Boolean);

    const records = await AttendanceDaily.find({
      employeeNumber: { $in: empNos },
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ employeeNumber: 1, date: 1 })
      .lean();

    // Group by employee
    const byEmployee = {};
    records.forEach(r => {
      const key = r.employeeNumber;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          empNo: key,
          name: employees.find(e => (e.emp_no || e.employeeNumber || e.customId) === key)?.employee_name || key,
          days: [],
          presentDays: 0,
          absentDays: 0,
          leaveDays: 0,
          weekOffDays: 0,
          holidayDays: 0,
          totalWorkingHours: 0,
          totalPayableShifts: 0,
          totalLateInMinutes: 0,
          totalEarlyOutMinutes: 0,
          lateInsCount: 0,
          earlyOutsCount: 0,
        };
      }
      const emp = byEmployee[key];
      emp.days.push({
        date: r.date,
        status: r.status,
        totalWorkingHours: r.totalWorkingHours || 0,
        payableShifts: r.payableShifts || 0,
        totalLateInMinutes: r.totalLateInMinutes || 0,
        totalEarlyOutMinutes: r.totalEarlyOutMinutes || 0,
        totalShifts: r.totalShifts || 0,
        shifts: (r.shifts || []).map(s => ({
          shiftName: s.shiftName,
          shiftStartTime: s.shiftStartTime,
          shiftEndTime: s.shiftEndTime,
          inTime: s.inTime,
          outTime: s.outTime,
          workingHours: s.workingHours,
          lateInMinutes: s.lateInMinutes || 0,
          earlyOutMinutes: s.earlyOutMinutes || 0,
          isLateIn: s.isLateIn || false,
          isEarlyOut: s.isEarlyOut || false,
          payableShift: s.payableShift || 1,
        })),
        source: r.source,
        notes: r.notes,
      });
      if (r.status === 'PRESENT') { emp.presentDays++; emp.totalWorkingHours += r.totalWorkingHours || 0; emp.totalPayableShifts += r.payableShifts || 0; }
      else if (r.status === 'ABSENT') emp.absentDays++;
      else if (r.status === 'LEAVE') emp.leaveDays++;
      else if (r.status === 'WEEK_OFF') emp.weekOffDays++;
      else if (r.status === 'HOLIDAY') emp.holidayDays++;
      emp.totalLateInMinutes += r.totalLateInMinutes || 0;
      emp.totalEarlyOutMinutes += r.totalEarlyOutMinutes || 0;
      if ((r.totalLateInMinutes || 0) > 0) emp.lateInsCount++;
      if ((r.totalEarlyOutMinutes || 0) > 0) emp.earlyOutsCount++;
    });

    const summaries = Object.values(byEmployee).map(e => ({
      ...e,
      totalWorkingHours: Math.round(e.totalWorkingHours * 100) / 100,
    }));

    return res.status(200).json({
      success: true,
      data: {
        period: { startDate, endDate },
        totalEmployees: summaries.length,
        totalRecords: records.length,
        summaries,
      },
    });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] getSummary error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /api/attendance/security-division/run-engine                          */
/*  Runs the dynamic Security Division attendance engine. Upserts              */
/*  AttendanceDaily records from actual biometric thumb punches.               */
/*                                                                             */
/*  Body params (all optional):                                                */
/*    startDate       YYYY-MM-DD  – defaults to current payroll cycle start    */
/*    endDate         YYYY-MM-DD  – defaults to current payroll cycle end      */
/*    empNos          string[]    – filter to specific employee numbers         */
/*    overrideWithThumbs boolean  – default true                               */
/*    dryRun          boolean     – if true, skip DB upserts (preview only)    */
/* ─────────────────────────────────────────────────────────────────────────── */
exports.runEngine = async (req, res) => {
  try {
    const {
      startDate: bodyStart,
      endDate: bodyEnd,
      empNos = null,
      overrideWithThumbs = true,
      dryRun = false,
    } = req.body || {};

    const { startDate, endDate } = resolveDateRange({
      startDate: bodyStart,
      endDate: bodyEnd,
    });

    console.log(`[SecurityDivisionCtrl] runEngine triggered by ${req.user?.email || 'system'} — ${startDate} to ${endDate}, dryRun=${dryRun}`);

    if (dryRun) {
      // Preview mode: just return employee + shift info, no write
      const { securityDiv, securityDept, employees } = await getSecurityDivisionEmployees(empNos);
      const { shifts } = await getSecurityDivisionShifts(securityDiv, securityDept);
      return res.status(200).json({
        success: true,
        message: `Dry-run preview for ${startDate} → ${endDate}`,
        data: {
          dryRun: true,
          period: { startDate, endDate },
          totalEmployees: employees.length,
          totalShifts: shifts.length,
          employees: employees.map(e => ({
            empNo: e.emp_no || e.employeeNumber || e.customId,
            name: e.employee_name || e.displayName || e.name,
          })),
          shifts: shifts.map(s => ({ name: s.name, startTime: s.startTime, endTime: s.endTime })),
        },
      });
    }

    const result = await runSecurityDivisionAttendanceEngine({
      startDate,
      endDate,
      empNos,
      overrideWithThumbs,
    });

    return res.status(200).json({
      success: true,
      message: `Security Division attendance engine completed for ${startDate} → ${endDate}`,
      data: result,
    });
  } catch (error) {
    console.error('[SecurityDivisionCtrl] runEngine error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
