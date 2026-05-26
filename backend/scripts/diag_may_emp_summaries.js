require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Leave = require('../leaves/model/Leave');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');

const EMPS = (process.env.EMP_LIST || '925,931,1715,1962,1730').split(',').map((s) => s.trim());

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const anchor = createISTDate('2026-05-15', '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const y = payrollCycle.year;
  const m = payrollCycle.month;
  const startStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endStr = extractISTComponents(payrollCycle.endDate).dateStr;
  console.log('Period', startStr, 'to', endStr, '| month', y, m);

  for (const empNo of EMPS) {
    const emp = await Employee.findOne({ emp_no: empNo }).lean();
    if (!emp) {
      console.log(empNo, 'NOT FOUND');
      continue;
    }
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const sum = await MonthlyAttendanceSummary.findOne({
      employeeId: emp._id,
      $or: [{ month: monthKey }, { year: y, month: m }],
    }).lean();
    const partials = await AttendanceDaily.find({
      employeeNumber: empNo,
      status: 'PARTIAL',
      date: { $gte: startStr, $lte: endStr },
    })
      .select('date status payableShifts policyMeta.partialDayRule shifts')
      .lean();

    console.log('\n====', empNo, emp.employee_name, '====');
    if (!sum) {
      console.log('NO MONTHLY SUMMARY for', y, m);
    } else {
      console.log({
        present: sum.totalPresentDays,
        partial: sum.totalPartialDays,
        overlap: sum.totalPartialPresentPayableOverlap,
        payable: sum.totalPayableShifts,
        lop: sum.totalLopLeaves,
        leave: sum.totalLeaves,
        od: sum.totalODs,
        absent: sum.totalAbsentDays,
      });
      const cd = sum.contributingDates || {};
      console.log('lopLeaves:', JSON.stringify(cd.lopLeaves));
      console.log('partial:', JSON.stringify(cd.partial));
      console.log('present:', JSON.stringify(cd.present));
      console.log('leaves:', JSON.stringify(cd.leaves));
    }
    console.log('PARTIAL dailies:', partials.length);
    for (const d of partials) {
      const rule = d.policyMeta?.partialDayRule;
      const sh = (d.shifts || [])[0];
      console.log(
        ' ',
        d.date,
        'pay=',
        d.payableShifts,
        'lopPortion=',
        rule?.lopPortion,
        'halves=',
        `${rule?.firstHalfStatus}/${rule?.secondHalfStatus}`,
        'in=',
        !!sh?.inTime,
        'out=',
        !!sh?.outTime
      );
    }

    const leaves = await Leave.find({
      employeeId: emp._id,
      status: 'approved',
      fromDate: { $lte: createISTDate(endStr, '23:59') },
      toDate: { $gte: createISTDate(startStr, '00:00') },
    })
      .select('fromDate toDate leaveType leaveNature isHalfDay halfDayType numberOfDays remarks status')
      .lean();
    if (leaves.length) {
      console.log(
        'Approved leaves:',
        leaves.map((l) => ({
          from: extractISTComponents(l.fromDate).dateStr,
          to: extractISTComponents(l.toDate).dateStr,
          type: l.leaveType,
          nature: l.leaveNature,
          half: l.isHalfDay,
          halfType: l.halfDayType,
          days: l.numberOfDays,
          status: l.status,
          recon: String(l.remarks || '').includes('[Auto attendance reconciliation]'),
        }))
      );
    }

    const presentWithLeave = await AttendanceDaily.find({
      employeeNumber: empNo,
      date: { $gte: startStr, $lte: endStr },
      status: { $in: ['PRESENT', 'HALF_DAY', 'PARTIAL'] },
    })
      .select('date status')
      .lean();
    for (const d of presentWithLeave) {
      const dayLeaves = leaves.filter((l) => {
        const fs = extractISTComponents(l.fromDate).dateStr;
        const ts = extractISTComponents(l.toDate).dateStr;
        return d.date >= fs && d.date <= ts;
      });
      if (dayLeaves.length) {
        console.log('  CONFLICT?', d.date, d.status, 'leaves:', dayLeaves.map((l) => l.leaveType));
      }
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
