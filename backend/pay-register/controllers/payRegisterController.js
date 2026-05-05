const PayRegisterSummary = require('../model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const PayrollBatch = require('../../payroll/model/PayrollBatch');
const {
  populatePayRegisterFromSources,
  getSummaryData,
  applyPayRegisterParityFromMonthlySummary,
} = require('../services/autoPopulationService');
const {
  calculateTotals,
  ensureTotalsRespectRoster,
  syncTotalsFromMonthlySummary,
  mergeSingleShiftPresentPayableFromSummaryIfApplicable,
  computeLeaveTypeBreakdownFromDailyRecords,
} = require('../services/totalsCalculationService');
const { updateDailyRecord } = require('../services/dailyRecordUpdateService');
const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
const { manualSyncPayRegister } = require('../services/autoSyncService');
const { processSummaryBulkUpload } = require('../services/summaryUploadService');
const {
  applyContributingDatesFromMonthlySummary,
  applyContributingDatesFromDailyGrid,
  cloneContributingDatesFromSummaryPlain,
  rebuildContributingDatesFromDailyRecords,
} = require('../services/contributingDatesService');
const { recalculatePayRegisterAttendanceDeduction } = require('../services/payRegisterAttendanceDeductionService');
const { assertEmployeeMonthEditable } = require('../../shared/services/payrollPeriodLockService');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Mongo filter for Pay Register list / export: pay-period employment scope, optional dept/div, optional text search (server-side).
 * Search matches employee name, emp no, and any of department / division / designation name or code.
 */
async function buildPayRegisterEmployeeFilter(
  rangeStart,
  rangeEnd,
  { departmentId, divisionId, employeeGroupId, search, scopeFilter } = {}
) {
  const toOid = (id) => {
    if (id === undefined || id === null || id === '') return null;
    const s = String(id);
    try {
      if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
    } catch (e) {
      /* ignore */
    }
    return id;
  };

  const employmentScopeOr = [
    { is_active: { $ne: false } },
    { is_active: false, leftDate: { $gte: rangeStart, $lte: rangeEnd } },
  ];

  const conditions = [{ $or: employmentScopeOr }];

  // Apply request-level data scope at endpoint boundary (same model = Employee)
  if (scopeFilter && typeof scopeFilter === 'object' && Object.keys(scopeFilter).length > 0) {
    conditions.push(scopeFilter);
  }

  if (departmentId) {
    conditions.push({ department_id: toOid(departmentId) });
  }
  if (divisionId) {
    conditions.push({ division_id: toOid(divisionId) });
  }
  if (employeeGroupId) {
    conditions.push({ employee_group_id: toOid(employeeGroupId) });
  }

  const searchTrim = search && String(search).trim();
  if (searchTrim) {
    const esc = searchTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: esc, $options: 'i' };
    const Department = require('../../departments/model/Department');
    const Division = require('../../departments/model/Division');
    const Designation = require('../../departments/model/Designation');

    const [deptIds, divIds, desigIds] = await Promise.all([
      Department.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
      Division.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
      Designation.find({ $or: [{ name: rx }, { code: rx }] }).distinct('_id'),
    ]);

    const searchOr = [{ employee_name: rx }, { emp_no: rx }];
    if (deptIds.length) searchOr.push({ department_id: { $in: deptIds } });
    if (divIds.length) searchOr.push({ division_id: { $in: divIds } });
    if (desigIds.length) searchOr.push({ designation_id: { $in: desigIds } });
    conditions.push({ $or: searchOr });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

async function ensureEmployeeInScope(req, res, employeeId) {
  if (!employeeId || !mongoose.Types.ObjectId.isValid(String(employeeId))) {
    res.status(400).json({ success: false, error: 'Invalid employeeId' });
    return false;
  }
  const scopeFilter = req.scopeFilter || {};
  const scopedQuery =
    scopeFilter && Object.keys(scopeFilter).length > 0
      ? { $and: [{ _id: new mongoose.Types.ObjectId(String(employeeId)) }, scopeFilter] }
      : { _id: new mongoose.Types.ObjectId(String(employeeId)) };
  const employee = await Employee.findOne(scopedQuery).select('_id').lean();
  if (!employee) {
    res.status(403).json({ success: false, error: 'Access denied for this employee in current scope' });
    return false;
  }
  return true;
}

async function getScopedEmployeeIds(req, extraQuery = {}) {
  const scopeFilter = req.scopeFilter || {};
  const query =
    scopeFilter && Object.keys(scopeFilter).length > 0
      ? { $and: [scopeFilter, extraQuery] }
      : extraQuery;
  const rows = await Employee.find(query).select('_id').lean();
  return rows.map((r) => r._id);
}

/** When a user saves day/grid edits, mark the pay register locked (same flag as Save & lock — sync skips unless force). */
function applySummaryLockFromEdit(payRegister, user) {
  if (!payRegister || !user || !user._id) return;
  payRegister.summaryLocked = true;
  payRegister.summaryLockedAt = new Date();
  payRegister.summaryLockedBy = user._id;
}

function isPayrollCompletedLockError(error) {
  return String(error?.message || '').toLowerCase().includes('payroll batch is completed');
}

/**
 * Pay Register Controller
 * Handles pay register CRUD operations
 */

// @desc    Get pay register for employee and month
// @route   GET /api/pay-register/:employeeId/:month
// @access  Private (exclude employee)
exports.getPayRegister = async (req, res) => {
  try {
    const { employeeId, month } = req.params;
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    // Find or create pay register
    let payRegister = await PayRegisterSummary.findOne({
      employeeId,
      month,
    })
      .populate('employeeId', 'employee_name emp_no department_id designation_id')
      .populate('dailyRecords.shiftId', 'name payableShifts')
      .populate('lastEditedBy', 'name email role')
      .populate('editedBy', 'name email role');

    // Sync totals + day-level parity with Monthly Attendance Summary — skip when summary is locked
    // (locked rows must keep stored dailyRecords/totals after save & lock or manual edits; opening GET must not overwrite)
    if (payRegister && !payRegister.summaryLocked) {
      const [year, monthNum] = month.split('-').map(Number);
      const summary = await getSummaryData(employeeId, payRegister.emp_no, year, monthNum);

      if (summary && Array.isArray(payRegister.dailyRecords) && payRegister.dailyRecords.length) {
        await applyPayRegisterParityFromMonthlySummary(
          payRegister.dailyRecords,
          summary,
          employeeId,
          payRegister.emp_no,
          year,
          monthNum
        );
        payRegister.markModified('dailyRecords');
      }

      if (summary) {
        await syncTotalsFromMonthlySummary(payRegister, summary);
        applyContributingDatesFromMonthlySummary(payRegister, summary);
      } else {
        payRegister.totals = calculateTotals(payRegister.dailyRecords, payRegister.contributingDates);
        payRegister.recalculateTotals();
        applyContributingDatesFromDailyGrid(payRegister);
      }

      let startDate = payRegister.startDate;
      let endDate = payRegister.endDate;
      if (!startDate || !endDate) {
        const [y, m] = payRegister.month.split('-').map(Number);
        const range = await getPayrollDateRange(y, m);
        startDate = range.startDate;
        endDate = range.endDate;
        payRegister.startDate = startDate;
        payRegister.endDate = endDate;
      }
      await ensureTotalsRespectRoster(payRegister.totals, payRegister.emp_no, startDate, endDate);
      await recalculatePayRegisterAttendanceDeduction(payRegister);
      await payRegister.save();
    }

    if (!payRegister) {
      // Auto-create by populating from sources
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        return res.status(404).json({
          success: false,
          error: 'Employee not found',
        });
      }

      const [year, monthNum] = month.split('-').map(Number);
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

      const dailyRecords = await populatePayRegisterFromSources(
        employeeId,
        employee.emp_no,
        year,
        monthNum
      );

      const payRegisterObj = {
        employeeId,
        emp_no: employee.emp_no,
        month,
        monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        year,
        monthNumber: monthNum,
        totalDaysInMonth: totalDays,
        startDate,
        endDate,
        dailyRecords,
        status: 'draft',
      };

      const summary = await getSummaryData(employeeId, employee.emp_no, year, monthNum);
      if (summary) {
        await applyPayRegisterParityFromMonthlySummary(
          dailyRecords,
          summary,
          employeeId,
          employee.emp_no,
          year,
          monthNum
        );
        await syncTotalsFromMonthlySummary(payRegisterObj, summary);
        payRegisterObj.contributingDates = cloneContributingDatesFromSummaryPlain(summary);
        payRegisterObj.contributingDatesUpdatedAt = new Date();
        payRegisterObj.contributingDatesDerivedFrom = 'monthly_summary';
      } else {
        payRegisterObj.contributingDates = rebuildContributingDatesFromDailyRecords(dailyRecords);
        payRegisterObj.contributingDatesUpdatedAt = new Date();
        payRegisterObj.contributingDatesDerivedFrom = 'daily_grid';
        payRegisterObj.totals = calculateTotals(dailyRecords, payRegisterObj.contributingDates);
        await ensureTotalsRespectRoster(payRegisterObj.totals, employee.emp_no, startDate, endDate);
      }

      payRegister = await PayRegisterSummary.create({
        ...payRegisterObj,
        lastAutoSyncedAt: new Date(),
      });

      await recalculatePayRegisterAttendanceDeduction(payRegister);
      await payRegister.save();

      await payRegister.populate([
        { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
        { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
      ]);
    }

    res.status(200).json({
      success: true,
      data: payRegister,
    });
  } catch (error) {
    console.error('Error getting pay register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get pay register',
    });
  }
};

// @desc    Create pay register
// @route   POST /api/pay-register/:employeeId/:month
// @access  Private (exclude employee)
exports.createPayRegister = async (req, res) => {
  try {
    const { employeeId, month } = req.params;
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    // Check if already exists
    const existing = await PayRegisterSummary.findOne({ employeeId, month });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Pay register already exists for this employee and month',
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

    const dailyRecords = await populatePayRegisterFromSources(
      employeeId,
      employee.emp_no,
      year,
      monthNum
    );

    const summary = await getSummaryData(employeeId, employee.emp_no, year, monthNum);
    let totals;
    let contributingDates;
    let contributingDatesUpdatedAt = new Date();
    let contributingDatesDerivedFrom;
    if (summary) {
      await applyPayRegisterParityFromMonthlySummary(
        dailyRecords,
        summary,
        employeeId,
        employee.emp_no,
        year,
        monthNum
      );
      const tmp = { totals: {} };
      await syncTotalsFromMonthlySummary(tmp, summary);
      totals = tmp.totals;
      contributingDates = cloneContributingDatesFromSummaryPlain(summary);
      contributingDatesDerivedFrom = 'monthly_summary';
    } else {
      contributingDates = rebuildContributingDatesFromDailyRecords(dailyRecords);
      contributingDatesDerivedFrom = 'daily_grid';
      totals = calculateTotals(dailyRecords, contributingDates);
      await ensureTotalsRespectRoster(totals, employee.emp_no, startDate, endDate);
    }

    const payRegister = await PayRegisterSummary.create({
      employeeId,
      emp_no: employee.emp_no,
      month,
      monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
      year,
      monthNumber: monthNum,
      totalDaysInMonth: totalDays,
      startDate,
      endDate,
      dailyRecords,
      totals,
      contributingDates,
      contributingDatesUpdatedAt,
      contributingDatesDerivedFrom,
      status: 'draft',
      lastAutoSyncedAt: new Date(),
    });

    await recalculatePayRegisterAttendanceDeduction(payRegister);
    await payRegister.save();

    await payRegister.populate([
      { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
      { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
    ]);

    res.status(201).json({
      success: true,
      data: payRegister,
    });
  } catch (error) {
    console.error('Error creating pay register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create pay register',
    });
  }
};

// @desc    Update pay register
// @route   PUT /api/pay-register/:employeeId/:month
// @access  Private (exclude employee)
exports.updatePayRegister = async (req, res) => {
  try {
    const { employeeId, month } = req.params;
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;
    await assertEmployeeMonthEditable(employeeId, month, employeeId);
    const { dailyRecords, status, notes, totals: totalsBody } = req.body;

    const payRegister = await PayRegisterSummary.findOne({ employeeId, month });
    if (!payRegister) {
      return res.status(404).json({
        success: false,
        error: 'Pay register not found',
      });
    }

    // Update dailyRecords if provided; recalc totals so any day/half marked OD (e.g. edited from absent) is included; WO/HOL from roster
    if (dailyRecords && Array.isArray(dailyRecords)) {
      const [year, monthNum] = month.split('-').map(Number);
      const preservedElUsedInPayroll = payRegister.totals?.elUsedInPayroll;
      payRegister.dailyRecords = dailyRecords;
      payRegister.totals = calculateTotals(dailyRecords, payRegister.contributingDates);
      if (preservedElUsedInPayroll !== undefined && preservedElUsedInPayroll !== null) {
        payRegister.totals.elUsedInPayroll = Math.max(0, Number(preservedElUsedInPayroll) || 0);
      }
      payRegister.recalculateTotals();
      let startDate = payRegister.startDate;
      let endDate = payRegister.endDate;
      if (!startDate || !endDate) {
        const range = await getPayrollDateRange(year, monthNum);
        startDate = range.startDate;
        endDate = range.endDate;
        payRegister.startDate = startDate;
        payRegister.endDate = endDate;
      }
      await ensureTotalsRespectRoster(payRegister.totals, payRegister.emp_no, startDate, endDate);
      if (!payRegister.summaryLocked) {
        const summary = await getSummaryData(employeeId, payRegister.emp_no, year, monthNum);
        if (summary) {
          const didMerge = await mergeSingleShiftPresentPayableFromSummaryIfApplicable(payRegister.totals, summary);
          if (didMerge) {
            applyContributingDatesFromMonthlySummary(payRegister, summary);
          } else {
            applyContributingDatesFromDailyGrid(payRegister);
          }
        } else {
          applyContributingDatesFromDailyGrid(payRegister);
        }
      } else {
        applyContributingDatesFromDailyGrid(payRegister);
      }
      payRegister.totals.leaveTypeBreakdown = computeLeaveTypeBreakdownFromDailyRecords(
        payRegister.dailyRecords,
        payRegister.contributingDates
      );
      payRegister.markModified('totals');
      applySummaryLockFromEdit(payRegister, req.user);
      await recalculatePayRegisterAttendanceDeduction(payRegister);
    }

    // Optional: set EL days used as paid in payroll (not from leave grid); used by payroll engine when "EL as paid" is on
    if (totalsBody && typeof totalsBody === 'object' && totalsBody.elUsedInPayroll !== undefined && totalsBody.elUsedInPayroll !== null) {
      if (!payRegister.totals) payRegister.totals = {};
      payRegister.totals.elUsedInPayroll = Math.max(0, Number(totalsBody.elUsedInPayroll) || 0);
      payRegister.markModified('totals');
    }

    // Update status if provided
    if (status) {
      payRegister.status = status;
    }

    // Update notes if provided
    if (notes !== undefined) {
      payRegister.notes = notes;
    }

    // Update edit tracking
    payRegister.lastEditedBy = req.user._id;
    payRegister.lastEditedAt = new Date();
    payRegister.editedBy = req.user._id;
    payRegister.editedAt = new Date();

    await payRegister.save();

    await payRegister.populate([
      { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
      { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
      { path: 'lastEditedBy', select: 'name email role' },
      { path: 'editedBy', select: 'name email role' },
      { path: 'summaryLockedBy', select: 'name email role' },
    ]);

    res.status(200).json({
      success: true,
      data: payRegister,
    });
  } catch (error) {
    console.error('Error updating pay register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update pay register',
    });
  }
};

// @desc    Update single daily record
// @route   PUT /api/pay-register/:employeeId/:month/daily/:date
// @access  Private (exclude employee)
exports.updateDailyRecord = async (req, res) => {
  try {
    const { employeeId, month, date } = req.params;
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;
    await assertEmployeeMonthEditable(employeeId, month, employeeId);
    const updateData = req.body;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

    // Validate date is within the payroll cycle
    if (date < startDate || date > endDate) {
      return res.status(400).json({
        success: false,
        error: `Date must be within the payroll cycle range (${startDate} to ${endDate})`,
      });
    }

    const payRegister = await PayRegisterSummary.findOne({ employeeId, month });
    if (!payRegister) {
      return res.status(404).json({
        success: false,
        error: 'Pay register not found',
      });
    }

    // Update daily record
    await updateDailyRecord(payRegister, date, updateData, req.user);

    // Recalculate totals so any day/half edited from absent to OD is included in totalPresentDays; WO/HOL from roster
    const preservedElUsedInPayrollDaily = payRegister.totals?.elUsedInPayroll;
    payRegister.totals = calculateTotals(payRegister.dailyRecords, payRegister.contributingDates);
    if (preservedElUsedInPayrollDaily !== undefined && preservedElUsedInPayrollDaily !== null) {
      payRegister.totals.elUsedInPayroll = Math.max(0, Number(preservedElUsedInPayrollDaily) || 0);
    }
    payRegister.recalculateTotals();
    await ensureTotalsRespectRoster(payRegister.totals, payRegister.emp_no, startDate, endDate);
    if (!payRegister.startDate || !payRegister.endDate) {
      payRegister.startDate = startDate;
      payRegister.endDate = endDate;
    }

    // Single-shift: Present Days + Payable Shifts must match monthly summary (present + partial − overlap), not only a grid sum.
    if (!payRegister.summaryLocked) {
      const summary = await getSummaryData(employeeId, payRegister.emp_no, year, monthNum);
      if (summary) {
        const didMerge = await mergeSingleShiftPresentPayableFromSummaryIfApplicable(payRegister.totals, summary);
        if (didMerge) {
          applyContributingDatesFromMonthlySummary(payRegister, summary);
        } else {
          applyContributingDatesFromDailyGrid(payRegister);
        }
      } else {
        applyContributingDatesFromDailyGrid(payRegister);
      }
    } else {
      applyContributingDatesFromDailyGrid(payRegister);
    }
    payRegister.totals.leaveTypeBreakdown = computeLeaveTypeBreakdownFromDailyRecords(
      payRegister.dailyRecords,
      payRegister.contributingDates
    );
    payRegister.markModified('totals');
    applySummaryLockFromEdit(payRegister, req.user);

    await recalculatePayRegisterAttendanceDeduction(payRegister);
    await payRegister.save();

    await payRegister.populate([
      { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
      { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
      { path: 'lastEditedBy', select: 'name email role' },
      { path: 'summaryLockedBy', select: 'name email role' },
    ]);

    res.status(200).json({
      success: true,
      data: payRegister,
    });
  } catch (error) {
    console.error('Error updating daily record:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update daily record',
    });
  }
};

// @desc    Sync pay register from sources
// @route   POST /api/pay-register/:employeeId/:month/sync
// @access  Private (exclude employee)
exports.syncPayRegister = async (req, res) => {
  const { employeeId, month } = req.params;
  try {
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;
    await assertEmployeeMonthEditable(employeeId, month, employeeId);
    const force = req.body && req.body.force === true;

    const payRegister = await manualSyncPayRegister(employeeId, month, { force });

    await payRegister.populate([
      { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
      { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
    ]);

    res.status(200).json({
      success: true,
      data: payRegister,
      message: 'Pay register synced successfully',
    });
  } catch (error) {
    console.error('Error syncing pay register:', error);
    if (isPayrollCompletedLockError(error)) {
      return res.status(409).json({
        success: false,
        code: error.code || 'PAYROLL_BATCH_COMPLETED',
        reason: error.reason || 'payroll_batch_completed',
        data: {
          employeeId,
          month,
          lockType: error.lockType || 'attendance_and_roster',
          lockSource: error.lockSource || 'payroll_batch',
          lockStatus: error.lockStatus || 'completed',
        },
        error: error.message,
        message: 'Payroll batch is already completed for this employee and month, so sync was skipped.',
      });
    }
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync pay register',
    });
  }
};

// @desc    Lock or unlock monthly summary (pay register docs) for many employees
// @route   POST /api/pay-register/summary-lock/:month
// @access  Private (exclude employee)
exports.setSummaryLock = async (req, res) => {
  try {
    const { month } = req.params;
    const { employeeIds, locked } = req.body;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'employeeIds array is required',
      });
    }
    if (typeof locked !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'locked must be a boolean',
      });
    }

    const mongoose = require('mongoose');
    const validIds = employeeIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid employee ObjectIds',
      });
    }

    const update = locked
      ? {
          summaryLocked: true,
          summaryLockedAt: new Date(),
          summaryLockedBy: req.user._id,
        }
      : {
          summaryLocked: false,
          summaryLockedAt: null,
          summaryLockedBy: null,
        };

    const scopedIds = await getScopedEmployeeIds(req, { _id: { $in: validIds } });
    const scopedIdSet = new Set(scopedIds.map((id) => String(id)));
    const allowedIds = validIds.filter((id) => scopedIdSet.has(String(id)));
    if (allowedIds.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'No scoped employees in request',
      });
    }

    const result = await PayRegisterSummary.updateMany(
      { employeeId: { $in: allowedIds }, month },
      { $set: update }
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    });
  } catch (error) {
    console.error('Error setting summary lock:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update summary lock',
    });
  }
};

// @desc    List employees with summaryLocked pay register for a month (scoped by division/department)
// @route   GET /api/pay-register/locked-employees/:month
// @access  Private (exclude employee)
exports.getLockedSummaryEmployees = async (req, res) => {
  try {
    const { month } = req.params;
    const { departmentId, divisionId, employeeGroupId, search } = req.query;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const mongoose = require('mongoose');
    const scopedEmployeeIds = await getScopedEmployeeIds(req);
    const docs = await PayRegisterSummary.find({
      month,
      summaryLocked: true,
      employeeId: { $in: scopedEmployeeIds },
    })
      .select('employeeId emp_no')
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id employee_group_id',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'division_id', select: 'name' },
          { path: 'designation_id', select: 'name' },
        ],
      })
      .lean();

    let divFilter = null;
    if (divisionId && mongoose.Types.ObjectId.isValid(String(divisionId))) {
      divFilter = new mongoose.Types.ObjectId(String(divisionId));
    }
    let deptFilter = null;
    if (departmentId && mongoose.Types.ObjectId.isValid(String(departmentId))) {
      deptFilter = new mongoose.Types.ObjectId(String(departmentId));
    }
    let groupFilter = null;
    if (employeeGroupId && mongoose.Types.ObjectId.isValid(String(employeeGroupId))) {
      groupFilter = new mongoose.Types.ObjectId(String(employeeGroupId));
    }

    const refId = (ref) => {
      if (!ref) return null;
      if (typeof ref === 'object' && ref._id) return String(ref._id);
      return String(ref);
    };

    const rows = [];
    for (const d of docs) {
      const emp = d.employeeId;
      if (!emp || typeof emp !== 'object') continue;

      if (divFilter) {
        const divIdVal = refId(emp.division_id);
        if (!divIdVal || divIdVal !== String(divFilter)) continue;
      }
      if (deptFilter) {
        const deptIdVal = refId(emp.department_id);
        if (!deptIdVal || deptIdVal !== String(deptFilter)) continue;
      }
      if (groupFilter) {
        const groupIdVal = refId(emp.employee_group_id);
        if (!groupIdVal || groupIdVal !== String(groupFilter)) continue;
      }

      const divObj = emp.division_id;
      const deptObj = emp.department_id;
      const desigObj = emp.designation_id;

      rows.push({
        employeeId: String(emp._id),
        emp_no: emp.emp_no || d.emp_no || '',
        employee_name: emp.employee_name || '',
        division: typeof divObj === 'object' && divObj !== null && divObj.name ? String(divObj.name) : '',
        department: typeof deptObj === 'object' && deptObj !== null && deptObj.name ? String(deptObj.name) : '',
        designation: typeof desigObj === 'object' && desigObj !== null && desigObj.name ? String(desigObj.name) : '',
      });
    }

    rows.sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || '', undefined, { sensitivity: 'base' }));

    const searchTrim = search && String(search).trim();
    const q = searchTrim ? searchTrim.toLowerCase() : '';
    const filteredRows = q
      ? rows.filter((r) => {
          const name = (r.employee_name || '').toLowerCase();
          const eno = (r.emp_no || '').toLowerCase();
          const dept = (r.department || '').toLowerCase();
          const desig = (r.designation || '').toLowerCase();
          const div = (r.division || '').toLowerCase();
          return (
            name.includes(q) ||
            eno.includes(q) ||
            dept.includes(q) ||
            desig.includes(q) ||
            div.includes(q)
          );
        })
      : rows;

    res.status(200).json({
      success: true,
      data: filteredRows,
      count: filteredRows.length,
    });
  } catch (error) {
    console.error('Error listing locked summary employees:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list locked summaries',
    });
  }
};

// @desc    Get edit history
// @route   GET /api/pay-register/:employeeId/:month/history
// @access  Private (exclude employee)
exports.getEditHistory = async (req, res) => {
  try {
    const { employeeId, month } = req.params;
    if (!(await ensureEmployeeInScope(req, res, employeeId))) return;

    const payRegister = await PayRegisterSummary.findOne({ employeeId, month })
      .select('editHistory')
      .populate('editHistory.editedBy', 'name email role');

    if (!payRegister) {
      return res.status(404).json({
        success: false,
        error: 'Pay register not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payRegister.editHistory || [],
    });
  } catch (error) {
    console.error('Error getting edit history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get edit history',
    });
  }
};

// @desc    Get all employees with pay registers for a month
// @route   GET /api/pay-register/employees/:month
// @access  Private (exclude employee)
exports.getEmployeesWithPayRegister = async (req, res) => {
  try {
    const { month } = req.params;
    const { departmentId, divisionId, employeeGroupId, status, page, limit, search } = req.query;

    console.log('[Pay Register Controller] getEmployeesWithPayRegister called:', {
      month,
      departmentId,
      divisionId,
      employeeGroupId,
      status,
      search: search ? '(set)' : undefined,
    });

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const Employee = require('../../employees/model/Employee');
    const PayrollRecord = require('../../payroll/model/PayrollRecord');

    // Parse month
    const [year, monthNum] = month.split('-').map(Number);
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

    const pageNum = parseInt(page, 10) || 1;
    const limitRaw = limit !== undefined && limit !== '' ? parseInt(limit, 10) : NaN;
    const limitNum = Number.isFinite(limitRaw) ? limitRaw : 50; // Default limit 50; use -1 for all
    const skip = limitNum === -1 ? 0 : (pageNum - 1) * limitNum;

    // Use UTC boundaries so "left in period" matches payroll calculation (excludes e.g. 25 Dec when period is 26 Dec–25 Jan).
    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    const employeeQuery = await buildPayRegisterEmployeeFilter(rangeStart, rangeEnd, {
      departmentId,
      divisionId,
      employeeGroupId,
      search,
      scopeFilter: req.scopeFilter,
    });

    // 1. Bulk Fetch Employees
    const totalEmployees = await Employee.countDocuments(employeeQuery);

    let employeeFetch = Employee.find(employeeQuery)
      .select('_id employee_name emp_no department_id designation_id leftDate leftReason')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 });

    // Bypass pagination if limit is -1
    if (limitNum !== -1) {
      employeeFetch = employeeFetch.skip(skip).limit(limitNum);
    }

    const employees = await employeeFetch;

    if (employees.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        pagination: {
          page: pageNum,
          limit: limitNum === -1 ? totalEmployees : limitNum,
          total: totalEmployees,
          totalPages: limitNum === -1 ? 1 : Math.ceil(totalEmployees / limitNum) || 1,
        },
      });
    }

    const employeeIds = employees.map(e => e._id);

    // 2. Bulk Fetch Existing Pay Registers (Include dailyRecords); include leftDate/leftReason so frontend can show "Left" employees
    const payRegisters = await PayRegisterSummary.find({
      employeeId: { $in: employeeIds },
      month
    })
      .populate('employeeId', 'employee_name emp_no department_id designation_id leftDate leftReason')
      .select('employeeId emp_no month status totals lastEditedAt dailyRecords startDate endDate totalDaysInMonth summaryLocked summaryLockedAt totalAttendanceDeductionDays attendanceDeductionBreakdown attendanceDeductionCalculatedAt');

    // Map for O(1) Access
    const prMap = new Map();
    payRegisters.forEach(pr => {
      const eId = pr.employeeId._id ? pr.employeeId._id.toString() : pr.employeeId.toString();
      prMap.set(eId, pr);
    });

    // 3. Bulk Fetch Payroll Records (Context)
    const payrollRecords = await PayrollRecord.find({
      employeeId: { $in: employeeIds },
      month
    }).select('employeeId _id');

    const payrollMap = new Map();
    payrollRecords.forEach(pr => payrollMap.set(pr.employeeId.toString(), pr._id));

    // 4. Construct Response (Merge & Stub)
    const results = employees.map(employee => {
      const eId = employee._id.toString();
      const existingPR = prMap.get(eId);
      const payrollId = payrollMap.get(eId);

      if (existingPR) {
        return {
          _id: existingPR._id,
          employeeId: existingPR.employeeId,
          emp_no: existingPR.emp_no,
          month: existingPR.month,
          status: existingPR.status,
          totals: existingPR.totals,
          dailyRecords: existingPR.dailyRecords || [],
          lastEditedAt: existingPR.lastEditedAt,
          payrollId: payrollId || null,
          startDate: existingPR.startDate || startDate,
          endDate: existingPR.endDate || endDate,
          totalDaysInMonth: existingPR.totalDaysInMonth || totalDays,
          summaryLocked: !!existingPR.summaryLocked,
          summaryLockedAt: existingPR.summaryLockedAt || null,
          totalAttendanceDeductionDays: existingPR.totalAttendanceDeductionDays ?? 0,
          attendanceDeductionBreakdown: existingPR.attendanceDeductionBreakdown ?? null,
          attendanceDeductionCalculatedAt: existingPR.attendanceDeductionCalculatedAt ?? null,
        };
      } else {
        // Return In-Memory Stub (Fast!)
        return {
          _id: `stub_${eId}`,
          employeeId: employee, // Full populated employee doc
          emp_no: employee.emp_no,
          month,
          status: 'draft',
          totals: {
            presentDays: 0,
            presentHalfDays: 0,
            totalPresentDays: 0,
            absentDays: 0,
            absentHalfDays: 0,
            totalAbsentDays: 0,
            paidLeaveDays: 0,
            paidLeaveHalfDays: 0,
            totalPaidLeaveDays: 0,
            unpaidLeaveDays: 0,
            unpaidLeaveHalfDays: 0,
            totalUnpaidLeaveDays: 0,
            lopDays: 0,
            lopHalfDays: 0,
            totalLopDays: 0,
            totalLeaveDays: 0,
            odDays: 0,
            odHalfDays: 0,
            totalODDays: 0,
            totalOTHours: 0,
            totalPayableShifts: 0
          },
          dailyRecords: [], // Empty for stubs
          lastEditedAt: null,
          payrollId: payrollId || null,
          isStub: true,
          startDate,
          endDate,
          totalDaysInMonth: totalDays,
          summaryLocked: false,
          summaryLockedAt: null,
          totalAttendanceDeductionDays: 0,
          attendanceDeductionBreakdown: null,
          attendanceDeductionCalculatedAt: null,
        };
      }
    });

    // Filter by status if requested (Note: Status filtering across pages is tricky without aggregation, doing post-filter for now but pagination applies to employees mainly)
    const finalResults = status ? results.filter(r => r.status === status) : results;

    res.status(200).json({
      success: true,
      count: finalResults.length,
      data: finalResults,
      startDate,
      endDate,
      pagination: {
        page: pageNum,
        limit: limitNum === -1 ? totalEmployees : limitNum,
        total: totalEmployees,
        totalPages: limitNum === -1 ? 1 : Math.max(1, Math.ceil(totalEmployees / limitNum)),
      },
    });

  } catch (error) {
    console.error('[Pay Register Controller] Error getting employees with pay register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get employees with pay register',
    });
  }
};

// @desc    Bulk upload monthly summary
// @route   POST /api/pay-register/upload-summary/:month
// @access  Private (exclude employee)
exports.uploadSummaryBulk = async (req, res) => {
  try {
    const { month } = req.params;
    const { data } = req.body;

    if (!month || !data || !Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'Month and data array are required',
      });
    }

    const allowedEmployeeIds = await getScopedEmployeeIds(req);
    const result = await processSummaryBulkUpload(month, data, req.user._id, {
      allowedEmployeeIds,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error bulk uploading summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to bulk upload summary',
    });
  }
};

const pdfNum = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

function payRegisterHalfLabel(half) {
  const status = String(half?.status || '').toLowerCase();
  if (!status || status === 'blank') return '';
  if (status === 'present') return 'P';
  if (status === 'absent') return 'A';
  if (status === 'od' || half?.isOD) return 'OD';
  if (status === 'holiday') return 'HOL';
  if (status === 'week_off') return 'WO';
  if (status === 'leave') {
    const nature = String(half?.leaveNature || '').toLowerCase();
    if (nature === 'lop' || nature === 'without_pay') return 'LOP';
    return 'LP';
  }
  return status.toUpperCase();
}

function payRegisterDayLabel(record) {
  if (!record) return '';
  const first = payRegisterHalfLabel(record.firstHalf);
  const second = payRegisterHalfLabel(record.secondHalf);
  if (!first && !second) return '';
  if (first && second && first === second) return first;
  if ((first === 'P' && second === 'A') || (first === 'A' && second === 'P')) return 'HD';
  return [first || '-', second || '-'].join('/');
}

function payRegisterSummaryFromDailyRecords(dailyRecords = []) {
  let halfDays = 0;
  for (const record of dailyRecords) {
    const first = payRegisterHalfLabel(record.firstHalf);
    const second = payRegisterHalfLabel(record.secondHalf);
    if (first && second && first !== second) halfDays += 1;
  }
  return { halfDays };
}

function drawPayRegisterPdfHeader(doc, title, subTitle) {
  const pageWidth = doc.page.width;
  doc.fillColor('#4f46e5').rect(0, 0, pageWidth, 45).fill();
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(title, 25, 12);
  doc.fontSize(8).font('Helvetica').text(subTitle, 25, 30);
  return 60;
}

function drawPayRegisterPdfTable(doc, headers, rows, startX, startY, colWidths, options = {}) {
  const {
    fontSize = 7,
    minRowHeight = 18,
    headerFill = '#4f46e5',
    rowFill = '#f8fafc',
    cellPaddingX = 3,
    cellPaddingY = 4,
    lineBreak = true,
    onPageAdd = null,
  } = options;

  let y = startY;
  const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const threshold = doc.page.height - 60;

  const drawHeaderRow = () => {
    doc.fillColor(headerFill).rect(startX, y, tableWidth, 24).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fontSize);
    let x = startX;
    headers.forEach((header, index) => {
      doc.text(String(header), x + cellPaddingX, y + 7, {
        width: Math.max(1, colWidths[index] - cellPaddingX * 2),
        align: 'center',
        lineBreak: false,
      });
      x += colWidths[index];
    });
    y += 24;
    doc.font('Helvetica').fontSize(fontSize).fillColor('#33414d');
  };

  drawHeaderRow();

  rows.forEach((row, rowIndex) => {
    let rowHeight = minRowHeight;
    if (lineBreak) {
      row.forEach((cell, index) => {
        const h = doc.heightOfString(String(cell ?? ''), {
          width: Math.max(1, colWidths[index] - cellPaddingX * 2),
          align: index < 2 ? 'left' : 'center',
        });
        rowHeight = Math.max(rowHeight, h + cellPaddingY * 2);
      });
    }

    if (y + rowHeight > threshold) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
      if (onPageAdd) onPageAdd();
      y = 60;
      drawHeaderRow();
    }

    if (rowIndex % 2 === 0) {
      doc.fillColor(rowFill).rect(startX, y, tableWidth, rowHeight).fill();
    }

    let x = startX;
    row.forEach((cell, index) => {
      doc.fillColor('#33414d').font('Helvetica').fontSize(fontSize);
      doc.text(String(cell ?? ''), x + cellPaddingX, y + cellPaddingY, {
        width: Math.max(1, colWidths[index] - cellPaddingX * 2),
        align: index < 2 ? 'left' : 'center',
        lineBreak,
        ellipsis: true,
      });
      x += colWidths[index];
    });

    y += rowHeight;
    doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(startX, y).lineTo(startX + tableWidth, y).stroke();
  });

  return y;
}

function drawPayRegisterPdfTableWithMultiHeader(doc, headerConfig, rows, startX, startY, colWidths, options = {}) {
  const {
    fontSize = 6.5,
    minRowHeight = 18,
    mainHeaderFill = '#f0f4f8',
    mainHeaderTextColor = '#1e293b',
    subHeaderFill = '#e2e8f0',
    subHeaderTextColor = '#334155',
    deductionHeaderFill = '#fce7f3',
    deductionSubHeaderFill = '#fee2e2',
    rowFill = '#f8fafc',
    alternateRowFill = '#ffffff',
    cellPaddingX = 3,
    cellPaddingY = 4,
    lineBreak = true,
    onPageAdd = null,
  } = options;

  let y = startY;
  const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const threshold = doc.page.height - 60;
  const borderColor = '#cbd5e1';

  const drawHeaderRows = () => {
    // First header row with main headers
    let x = startX;
    headerConfig.mainHeaders.forEach((headerObj, colIndex) => {
      const colSpan = headerObj.colSpan || 1;
      const headerWidth = colWidths.slice(colIndex, colIndex + colSpan).reduce((a, b) => a + b, 0);
      
      // Background color
      if (headerObj.bgColor) {
        doc.fillColor(headerObj.bgColor).rect(x, y, headerWidth, 20).fill();
      } else {
        doc.fillColor(mainHeaderFill).rect(x, y, headerWidth, 20).fill();
      }
      
      // Border
      doc.strokeColor(borderColor).lineWidth(0.5);
      doc.rect(x, y, headerWidth, 20);
      doc.stroke();
      
      // Text
      doc.fillColor(headerObj.textColor || mainHeaderTextColor).font('Helvetica-Bold').fontSize(fontSize);
      doc.text(String(headerObj.label), x + cellPaddingX, y + 6, {
        width: Math.max(1, headerWidth - cellPaddingX * 2),
        align: 'center',
        lineBreak: false,
      });
      
      x += headerWidth;
    });
    y += 20;

    // Second header row with sub-headers (if exists)
    if (headerConfig.subHeaders && headerConfig.subHeaders.length > 0) {
      x = startX;
      headerConfig.subHeaders.forEach((headerObj, colIndex) => {
        const colSpan = headerObj.colSpan || 1;
        const headerWidth = colWidths.slice(colIndex, colIndex + colSpan).reduce((a, b) => a + b, 0);
        
        // Background color
        if (headerObj.bgColor) {
          doc.fillColor(headerObj.bgColor).rect(x, y, headerWidth, 16).fill();
        } else {
          doc.fillColor(subHeaderFill).rect(x, y, headerWidth, 16).fill();
        }
        
        // Border
        doc.strokeColor(borderColor).lineWidth(0.5);
        doc.rect(x, y, headerWidth, 16);
        doc.stroke();
        
        // Text
        doc.fillColor(headerObj.textColor || subHeaderTextColor).font('Helvetica-Bold').fontSize(fontSize - 0.5);
        doc.text(String(headerObj.label), x + cellPaddingX, y + 3, {
          width: Math.max(1, headerWidth - cellPaddingX * 2),
          align: 'center',
          lineBreak: false,
        });
        
        x += headerWidth;
      });
      y += 16;
    }

    doc.font('Helvetica').fontSize(fontSize).fillColor('#33414d');
  };

  drawHeaderRows();

  rows.forEach((row, rowIndex) => {
    let rowHeight = minRowHeight;
    if (lineBreak) {
      row.forEach((cell, index) => {
        const h = doc.heightOfString(String(cell ?? ''), {
          width: Math.max(1, colWidths[index] - cellPaddingX * 2),
          align: index === 0 ? 'left' : 'center',
        });
        rowHeight = Math.max(rowHeight, h + cellPaddingY * 2);
      });
    }

    if (y + rowHeight > threshold) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
      if (onPageAdd) onPageAdd();
      y = 60;
      drawHeaderRows();
    }

    // Alternate row colors
    const bgColor = rowIndex % 2 === 0 ? rowFill : alternateRowFill;
    doc.fillColor(bgColor).rect(startX, y, tableWidth, rowHeight).fill();

    // Draw cell borders and content
    let x = startX;
    row.forEach((cell, index) => {
      const colWidth = colWidths[index];
      
      // Border
      doc.strokeColor(borderColor).lineWidth(0.5);
      doc.rect(x, y, colWidth, rowHeight);
      doc.stroke();

      // Text
      doc.fillColor('#33414d').font('Helvetica').fontSize(fontSize);
      doc.text(String(cell ?? ''), x + cellPaddingX, y + cellPaddingY, {
        width: Math.max(1, colWidth - cellPaddingX * 2),
        align: index === 0 ? 'left' : 'center',
        lineBreak,
        ellipsis: true,
      });
      
      x += colWidth;
    });

    y += rowHeight;
  });

  return y;
}

// @desc    Export monthly summary as Excel
// @route   GET /api/pay-register/export-summary/:month
// @access  Private (exclude employee)
exports.exportSummaryExcel = async (req, res) => {
  try {
    const { month } = req.params;
    const { departmentId, divisionId, employeeGroupId, search } = req.query;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    const employeeQuery = await buildPayRegisterEmployeeFilter(rangeStart, rangeEnd, {
      departmentId,
      divisionId,
      employeeGroupId,
      search,
      scopeFilter: req.scopeFilter,
    });

    const employees = await Employee.find(employeeQuery)
      .select('_id employee_name emp_no department_id designation_id division_id')
      .populate('department_id', 'name')
      .populate('division_id', 'name')
      .populate('designation_id', 'name')
      .sort({ emp_no: 1 });

    const employeeIds = employees.map(e => e._id);

    const payRegisters = await PayRegisterSummary.find({
      employeeId: { $in: employeeIds },
      month
    }).lean();

    const prMap = new Map(payRegisters.map(pr => [pr.employeeId.toString(), pr]));

    const rows = employees.map(emp => {
      const pr = prMap.get(emp._id.toString());
      const totals = pr?.totals || {};

      return {
        'Employee Code': emp.emp_no,
        'Employee Name': emp.employee_name,
        'Division': emp.division_id?.name || 'N/A',
        'Department': emp.department_id?.name || 'N/A',
        'Designation': emp.designation_id?.name || 'N/A',
        'Total OD': totals.totalODDays || 0,
        'Total Present': totals.totalPresentDays || 0,
        'Paid Leaves': totals.totalPaidLeaveDays || 0,
        'LOP Count': totals.totalLopDays || 0,
        'Total Absent': totals.totalAbsentDays || 0,
        'Holiday Count': (totals.totalWeeklyOffs || 0) + (totals.totalHolidays || 0),
        'Late Count': (Number(totals.lateCount) || 0) + (Number(totals.earlyOutCount) || 0),
        'OT Hours': totals.totalOTHours || 0,
        'Extra Days': totals.extraDays || 0,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Summary');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `PayRegister_Summary_${month}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);

  } catch (error) {
    console.error('Error exporting summary Excel:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export summary Excel',
    });
  }
};

// @desc    Export monthly summary and day breakdown as PDF
// @route   GET /api/pay-register/export-summary-pdf/:month
// @access  Private (exclude employee)
exports.exportSummaryPDF = async (req, res) => {
  try {
    const { month } = req.params;
    const { departmentId, divisionId, employeeGroupId, search } = req.query;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    const employeeQuery = await buildPayRegisterEmployeeFilter(rangeStart, rangeEnd, {
      departmentId,
      divisionId,
      employeeGroupId,
      search,
      scopeFilter: req.scopeFilter,
    });

    const employees = await Employee.find(employeeQuery)
      .select('_id employee_name emp_no department_id designation_id division_id doj leftDate')
      .populate('department_id', 'name')
      .populate('division_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 })
      .lean();

    if (employees.length === 0) {
      return res.status(404).json({ success: false, error: 'No employees found with the selected filters' });
    }

    const employeeIds = employees.map((emp) => emp._id);
    const payRegisters = await PayRegisterSummary.find({
      employeeId: { $in: employeeIds },
      month,
    })
      .select('employeeId emp_no month totals dailyRecords startDate endDate totalDaysInMonth totalAttendanceDeductionDays')
      .lean();

    const prMap = new Map(payRegisters.map((pr) => [String(pr.employeeId), pr]));

    const daysArray = [];
    let cursor = dayjs(startDate);
    const last = dayjs(endDate);
    while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
      daysArray.push(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
    }

    const grouped = {};
    for (const emp of employees) {
      const divName = emp.division_id?.name || 'Unassigned Division';
      const deptName = emp.department_id?.name || 'Unassigned Department';
      if (!grouped[divName]) grouped[divName] = {};
      if (!grouped[divName][deptName]) grouped[divName][deptName] = [];
      grouped[divName][deptName].push(emp);
    }

    const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape', bufferPages: true });
    const filename = `PayRegister_Summary_${month}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageWidth = 841.89;
    const margin = 25;
    
    // Define multi-level header structure matching the user's request
    const mainHeaders = [
      { label: 'Employee', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Present Days', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Week Offs', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Holidays', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Total Leaves', colSpan: 3, bgColor: '#fffbeb', textColor: '#92400e' },
      { label: 'OD Days', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Absents', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Total Days', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Lates (L+E)', colSpan: 1, bgColor: '#f1f5f9', textColor: '#1e293b' },
      { label: 'Deduction Days', colSpan: 3, bgColor: '#fff1f2', textColor: '#9f1239' },
      { label: 'Paid Days', colSpan: 1, bgColor: '#f0fdf4', textColor: '#166534' },
    ];

    const subHeaders = [
      { label: 'Employee', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Total', colSpan: 1, bgColor: '#fef3c7', textColor: '#92400e' },
      { label: 'Paid', colSpan: 1, bgColor: '#fef3c7', textColor: '#92400e' },
      { label: 'LOP', colSpan: 1, bgColor: '#fef3c7', textColor: '#92400e' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Days', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Count', colSpan: 1, bgColor: '#f1f5f9', textColor: '#475569' },
      { label: 'Absent', colSpan: 1, bgColor: '#ffe4e6', textColor: '#9f1239' },
      { label: 'LOP', colSpan: 1, bgColor: '#ffe4e6', textColor: '#9f1239' },
      { label: 'Att.Ded', colSpan: 1, bgColor: '#ffe4e6', textColor: '#9f1239' },
      { label: 'Final', colSpan: 1, bgColor: '#dcfce7', textColor: '#166534' },
    ];

    const colWidths = [120, 48, 45, 45, 45, 45, 45, 45, 45, 50, 45, 45, 45, 45, 58];
    const gridHeaders = ['Employee Name', 'E.No', ...daysArray.map((d) => String(dayjs(d).date()))];
    const nameWidth = 92;
    const enoWidth = 32;
    const dayWidth = Number(((pageWidth - margin * 2 - nameWidth - enoWidth) / Math.max(1, daysArray.length)).toFixed(2));
    const gridWidths = [nameWidth, enoWidth, ...daysArray.map(() => dayWidth)];

    let firstPage = true;
    const sortedDivisions = Object.keys(grouped).sort();

    for (const divName of sortedDivisions) {
      const sortedDepartments = Object.keys(grouped[divName]).sort();
      for (const deptName of sortedDepartments) {
        if (!firstPage) doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
        firstPage = false;

        let y = drawPayRegisterPdfHeader(
          doc,
          `PAY REGISTER REPORT - DIV: ${divName.toUpperCase()}`,
          `Department: ${deptName.toUpperCase()} | Period: ${startDate} to ${endDate}`
        );

        const deptEmployees = grouped[divName][deptName].sort((a, b) =>
          (a.employee_name || '').localeCompare(b.employee_name || '', undefined, { sensitivity: 'base' })
        );

        const summaryRows = [];
        const gridRows = [];

        for (const emp of deptEmployees) {
          const pr = prMap.get(String(emp._id));
          const totals = pr?.totals || {};
          const dailyRecords = Array.isArray(pr?.dailyRecords) ? pr.dailyRecords : [];
          const dailyMap = new Map(dailyRecords.map((record) => [record.date, record]));
          
          const totalPresent = Number(totals.totalPresentDays) || 0;
          const totalAbsent = Number(totals.totalAbsentDays) || 0;
          const totalLeaves = Number(totals.totalLeaveDays) || 0;
          const paidLeaves = Number(totals.totalPaidLeaveDays) || 0;
          const lopLeaves = Math.max(0, totalLeaves - paidLeaves);
          const totalOD = Number(totals.totalODDays) || 0;
          const lateCount = (Number(totals.lateCount) || 0) + (Number(totals.earlyOutCount) || 0);
          
          const weekOffs = Number(totals.totalWeeklyOffs) || 0;
          const holidays = Number(totals.totalHolidays) || 0;
          const monthDays = Number(totals.totalDaysInMonth) || daysArray.length;
          
          const lopDed = Number(totals.totalLopDays) || 0;
          const attDed = Number(pr?.totalAttendanceDeductionDays) || 0;
          
          // Paid Days = Total Days - Absent - LOP - Att.Ded
          const paidDays = monthDays - totalAbsent - lopDed - attDed;

          const designationLabel = emp.designation_id?.name || '-';

          summaryRows.push([
            { label: `${emp.employee_name || '-'}\n${emp.emp_no || '-'} | ${designationLabel}`, align: 'left' },
            pdfNum(totalPresent),
            pdfNum(weekOffs),
            pdfNum(holidays),
            pdfNum(totalLeaves),
            pdfNum(paidLeaves),
            pdfNum(lopLeaves),
            pdfNum(totalOD),
            pdfNum(totalAbsent),
            pdfNum(monthDays),
            pdfNum(lateCount),
            pdfNum(totalAbsent), // Absent Deduction
            pdfNum(lopDed),      // LOP Deduction
            pdfNum(attDed),      // Att.Ded
            pdfNum(paidDays),
          ]);

          const dojStr = emp.doj ? dayjs(emp.doj).tz('Asia/Kolkata').format('YYYY-MM-DD') : null;
          const leftDateStr = emp.leftDate ? dayjs(emp.leftDate).tz('Asia/Kolkata').format('YYYY-MM-DD') : null;
          const gridRow = [emp.employee_name || '-', emp.emp_no || '-'];
          for (const dStr of daysArray) {
            if ((dojStr && dStr < dojStr) || (leftDateStr && dStr > leftDateStr)) {
              gridRow.push('');
            } else {
              gridRow.push(payRegisterDayLabel(dailyMap.get(dStr)) || (pr ? 'A' : '-'));
            }
          }
          gridRows.push(gridRow);
        }

        doc.fillColor('#f8fafc').rect(margin, y, pageWidth - 2 * margin, 16).fill();
        doc.fillColor('#4f46e5').fontSize(9).font('Helvetica-Bold').text(`SUMMARY: ${deptName.toUpperCase()}`, margin + 10, y + 3);
        y += 20;

        // Draw multi-header summary table
        y = drawPayRegisterPdfTableWithMultiHeader(
          doc,
          { mainHeaders, subHeaders },
          summaryRows.map(row => row.map(cell => typeof cell === 'object' ? cell.label : cell)),
          margin,
          y,
          colWidths,
          {
            fontSize: 6.2,
            minRowHeight: 20,
            onPageAdd: () => drawPayRegisterPdfHeader(doc, `PAY REGISTER SUMMARY (CONT) - ${divName.toUpperCase()}`, `Dept: ${deptName.toUpperCase()}`),
          }
        );

        // Always start Day Breakdown on a new page for clarity
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
        y = drawPayRegisterPdfHeader(doc, `PAY REGISTER DAY BREAKDOWN - ${divName.toUpperCase()}`, `Dept: ${deptName.toUpperCase()} | Period: ${startDate} to ${endDate}`);
        
        doc.fillColor('#f8fafc').rect(margin, y, pageWidth - 2 * margin, 16).fill();
        doc.fillColor('#4f46e5').fontSize(9).font('Helvetica-Bold').text(`DAY BREAKDOWN: ${deptName.toUpperCase()}`, margin + 10, y + 3);
        y += 20;


        drawPayRegisterPdfTable(doc, gridHeaders, gridRows, margin, y, gridWidths, {
          fontSize: 4.8,
          minRowHeight: 20,
          cellPaddingX: 1,
          cellPaddingY: 3,
          onPageAdd: () => drawPayRegisterPdfHeader(doc, `PAY REGISTER DAY BREAKDOWN (CONT) - ${divName.toUpperCase()}`, `Dept: ${deptName.toUpperCase()}`),
        });
      }
    }

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#94a3b8').text(
        `Generated by HRMS on ${dayjs().tz('Asia/Kolkata').format('DD MMM YYYY, hh:mm A')} | Page ${i + 1} of ${pages.count}`,
        0,
        doc.page.height - 35,
        { align: 'center', width: doc.page.width }
      );
    }

    doc.end();
  } catch (error) {
    console.error('Error exporting summary PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export summary PDF',
    });
  }
};
