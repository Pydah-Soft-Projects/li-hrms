/**
 * Plan mid-period payroll segments and drive calc with timeline salary/org.
 */

const Employee = require('../../employees/model/Employee');
const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
const {
  listPayrollSegmentsForRange,
  ensureInitialTimeline,
  startOfUtcDay,
} = require('../../employees/services/employeeTimelineService');

function toYmd(d) {
  const x = startOfUtcDay(d);
  if (!x) return null;
  return x.toISOString().slice(0, 10);
}

/**
 * @returns {Promise<Array<{ segmentIndex, startDate, endDate, division_id, department_id, gross_salary }>>}
 */
async function planPayrollSegments(employeeId, month) {
  const [y, m] = String(month).split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(y, m);
  const emp = await Employee.findById(employeeId);
  if (!emp) throw new Error('Employee not found');
  ensureInitialTimeline(emp);
  if (emp.isModified && (emp.isModified('orgHistory') || emp.isModified('salaryHistory'))) {
    await emp.save();
  } else if (!emp.orgHistory?.length || !emp.salaryHistory?.length) {
    await emp.save();
  }

  const windows = listPayrollSegmentsForRange(emp, startDate, endDate);
  if (!windows.length) {
    return [
      {
        segmentIndex: 0,
        startDate,
        endDate,
        division_id: emp.division_id,
        department_id: emp.department_id,
        gross_salary: Number(emp.gross_salary) || 0,
      },
    ];
  }
  return windows.map((w) => ({
    ...w,
    startDate: toYmd(w.startDate) || startDate,
    endDate: toYmd(w.endDate) || endDate,
  }));
}

/**
 * Run calculatePayrollNew once per segment when mid-period transfer exists.
 */
async function calculatePayrollWithSegments(employeeId, month, userId, options, calculateOne) {
  const segments = await planPayrollSegments(employeeId, month);
  const results = [];
  for (const seg of segments) {
    const segOptions = {
      ...options,
      segment: {
        segmentIndex: seg.segmentIndex,
        segmentStartDate: seg.startDate,
        segmentEndDate: seg.endDate,
        division_id: seg.division_id,
        department_id: seg.department_id,
        gross_salary: seg.gross_salary,
      },
      // Only consume recalc permission on last segment
      consumeRecalculationPermission:
        seg.segmentIndex === segments.length - 1
          ? options.consumeRecalculationPermission !== false
          : false,
    };
    const one = await calculateOne(employeeId, month, userId, segOptions);
    results.push(one);
  }
  return {
    segments: results,
    payrollRecord: results[results.length - 1]?.payrollRecord,
    batchId: results[results.length - 1]?.batchId,
    payslip: results[results.length - 1]?.payslip,
    multiSegment: results.length > 1,
  };
}

module.exports = {
  planPayrollSegments,
  calculatePayrollWithSegments,
  toYmd,
};
