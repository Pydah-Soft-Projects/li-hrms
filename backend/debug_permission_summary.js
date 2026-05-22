require('dotenv').config();
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('./attendance/model/MonthlyAttendanceSummary');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');
const Employee = require('./employees/model/Employee');
const Permission = require('./permissions/model/Permission');
const dateCycleService = require('./leaves/services/dateCycleService');
const { extractISTComponents } = require('./shared/utils/dateUtils');
const { getResolvedPermissionDeductionRules } = require('./payroll/services/deductionService');
(async () => {
  try {
    // Mongoose v9 / MongoDB driver v6: legacy options are not supported
    await mongoose.connect(process.env.MONGODB_URI);
    const empNos = ['2144','2145','2146'];
    const month = '2026-04';

    const [year, monthNum] = month.split('-').map(Number);
    const cycle = await dateCycleService.getPayrollCycleForMonth(year, monthNum);
    const cycleStartStr = extractISTComponents(cycle.startDate).dateStr;
    const cycleEndStr = extractISTComponents(cycle.endDate).dateStr;
    console.log('PAY_CYCLE:', { month, start: cycleStartStr, end: cycleEndStr, isCustomCycle: !!cycle.isCustomCycle });

    const summaries = await MonthlyAttendanceSummary.find({ emp_no: { $in: empNos }, month }).lean();
    console.log('SUMMARIES:', JSON.stringify(summaries.map(s => ({ emp_no: s.emp_no, totalPermissionCount: s.totalPermissionCount, totalPermissionDeductionDays: s.totalPermissionDeductionDays, totalAttendanceDeductionDays: s.totalAttendanceDeductionDays, permissionDeductionBreakdown: s.permissionDeductionBreakdown, totalDaysInMonth: s.totalDaysInMonth })), null, 2));
    const daily = await AttendanceDaily.find({ employeeNumber: { $in: empNos }, date: { $gte: cycleStartStr, $lte: cycleEndStr } }).select('employeeNumber date permissionCount permissionHours permissionDeduction status shifts').lean().sort({ employeeNumber:1, date:1 });
    const grouped = {};
    daily.forEach(d => { grouped[d.employeeNumber] = grouped[d.employeeNumber] || []; grouped[d.employeeNumber].push(d); });
    console.log('DAILY_COUNTS:');
    for (const empNo of empNos) {
      const recs = grouped[empNo] || [];
      const totalCount = recs.reduce((a,r) => a + (Number(r.permissionCount)||0), 0);
      const totalDed = recs.reduce((a,r) => a + (Number(r.permissionDeduction)||0), 0);
      console.log(empNo, 'daily count', totalCount, 'daily ded', totalDed, 'rows', recs.length);
    }

    console.log('EMPLOYEE + RULES + PERMISSIONS:');
    for (const empNo of empNos) {
      const emp = await Employee.findOne({ emp_no: String(empNo).toUpperCase() })
        .select('_id emp_no employee_name department_id division_id deductPermission gross_salary')
        .lean();
      if (!emp) {
        console.log(empNo, 'EMP_NOT_FOUND');
        continue;
      }
      const deptId = emp.department_id ? String(emp.department_id) : null;
      const divId = emp.division_id ? String(emp.division_id) : null;
      const rules = deptId ? await getResolvedPermissionDeductionRules(deptId, divId) : null;
      console.log(empNo, {
        deptId,
        divId,
        deductPermission: emp.deductPermission,
        resolvedRules: rules,
      });

      const perms = await Permission.find({
        employeeId: emp._id,
        isActive: true,
        date: { $gte: cycleStartStr, $lte: cycleEndStr },
        status: { $in: ['approved', 'checked_in', 'checked_out'] },
      })
        .select('date status permissionType permissionHours creationSource autoCreationMeta')
        .lean()
        .sort({ date: 1 });
      console.log(empNo, 'PERMS_FOUND', perms.length);
      perms.forEach((p) => {
        console.log(
          ' ',
          p.date,
          p.status,
          p.permissionType,
          'hours',
          p.permissionHours,
          'src',
          p.creationSource,
          'shift',
          p.autoCreationMeta?.shiftNumber ?? null
        );
      });
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
