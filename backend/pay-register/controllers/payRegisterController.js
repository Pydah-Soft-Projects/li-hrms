const PayRegisterSummary = require('../model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const PayrollBatch = require('../../payroll/model/PayrollBatch');
const {
  populatePayRegisterFromSources,
  getSummaryData,
  applyPayRegisterParityFromMonthlySummary,
} = require('../services/autoPopulationService');
const { calculateTotals, ensureTotalsRespectRoster, syncTotalsFromMonthlySummary } = require('../services/totalsCalculationService');
const { updateDailyRecord } = require('../services/dailyRecordUpdateService');
const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
const { manualSyncPayRegister } = require('../services/autoSyncService');
const { processSummaryBulkUpload } = require('../services/summaryUploadService');
const XLSX = require('xlsx');

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

    // Sync totals + day-level WO/HOL with Monthly Attendance Summary (same rules as attendance module)
    if (payRegister) {
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
        syncTotalsFromMonthlySummary(payRegister, summary);
      } else {
        payRegister.totals = calculateTotals(payRegister.dailyRecords);
        payRegister.recalculateTotals();
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
        syncTotalsFromMonthlySummary(payRegisterObj, summary);
      } else {
        payRegisterObj.totals = calculateTotals(dailyRecords);
        await ensureTotalsRespectRoster(payRegisterObj.totals, employee.emp_no, startDate, endDate);
      }

      payRegister = await PayRegisterSummary.create({
        ...payRegisterObj,
        lastAutoSyncedAt: new Date(),
      });

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
      syncTotalsFromMonthlySummary(tmp, summary);
      totals = tmp.totals;
    } else {
      totals = calculateTotals(dailyRecords);
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
      status: 'draft',
      lastAutoSyncedAt: new Date(),
    });

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
    const { dailyRecords, status, notes } = req.body;

    const payRegister = await PayRegisterSummary.findOne({ employeeId, month });
    if (!payRegister) {
      return res.status(404).json({
        success: false,
        error: 'Pay register not found',
      });
    }

    // Update dailyRecords if provided; recalc totals so any day/half marked OD (e.g. edited from absent) is included in present days; WO/HOL from roster
    if (dailyRecords && Array.isArray(dailyRecords)) {
      payRegister.dailyRecords = dailyRecords;
      payRegister.totals = calculateTotals(dailyRecords);
      payRegister.recalculateTotals();
      let startDate = payRegister.startDate;
      let endDate = payRegister.endDate;
      if (!startDate || !endDate) {
        const [y, m] = month.split('-').map(Number);
        const range = await getPayrollDateRange(y, m);
        startDate = range.startDate;
        endDate = range.endDate;
        payRegister.startDate = startDate;
        payRegister.endDate = endDate;
      }
      await ensureTotalsRespectRoster(payRegister.totals, payRegister.emp_no, startDate, endDate);
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
    payRegister.totals = calculateTotals(payRegister.dailyRecords);
    payRegister.recalculateTotals();
    await ensureTotalsRespectRoster(payRegister.totals, payRegister.emp_no, startDate, endDate);
    if (!payRegister.startDate || !payRegister.endDate) {
      payRegister.startDate = startDate;
      payRegister.endDate = endDate;
    }

    await payRegister.save();

    await payRegister.populate([
      { path: 'employeeId', select: 'employee_name emp_no department_id designation_id' },
      { path: 'dailyRecords.shiftId', select: 'name payableShifts' },
      { path: 'lastEditedBy', select: 'name email role' },
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
  try {
    const { employeeId, month } = req.params;
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

    const result = await PayRegisterSummary.updateMany(
      { employeeId: { $in: validIds }, month },
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
    const { departmentId, divisionId } = req.query;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const mongoose = require('mongoose');
    const docs = await PayRegisterSummary.find({ month, summaryLocked: true })
      .select('employeeId emp_no')
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id division_id designation_id',
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

    res.status(200).json({
      success: true,
      data: rows,
      count: rows.length,
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
    const { departmentId, divisionId, status, page, limit } = req.query;

    console.log('[Pay Register Controller] getEmployeesWithPayRegister called:', {
      month,
      departmentId,
      divisionId,
      status
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
    const mongoose = require('mongoose');

    // Parse month
    const [year, monthNum] = month.split('-').map(Number);
    const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
    const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50; // Default limit 50
    const skip = (pageNum - 1) * limitNum;

    // Use UTC boundaries so "left in period" matches payroll calculation (excludes e.g. 25 Dec when period is 26 Dec–25 Jan).
    const rangeStart = new Date(startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(endDate + 'T23:59:59.999Z');

    // Build Employee Query - include active employees OR those who left within this specific payroll cycle
    let employeeQuery = {
      $or: [
        { is_active: true, leftDate: null },
        { leftDate: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };

    if (departmentId) {
      let deptObjectId = departmentId;
      try {
        if (mongoose.Types.ObjectId.isValid(departmentId)) {
          deptObjectId = new mongoose.Types.ObjectId(departmentId);
        }
      } catch (err) { }
      employeeQuery.department_id = deptObjectId;
    }

    if (divisionId) {
      let divObjectId = divisionId;
      try {
        if (mongoose.Types.ObjectId.isValid(divisionId)) {
          divObjectId = new mongoose.Types.ObjectId(divisionId);
        }
      } catch (err) { }
      employeeQuery.division_id = divObjectId;
    }

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
          limit: limitNum,
          total: totalEmployees,
          totalPages: Math.ceil(totalEmployees / limitNum)
        }
      });
    }

    const employeeIds = employees.map(e => e._id);

    // 2. Bulk Fetch Existing Pay Registers (Include dailyRecords); include leftDate/leftReason so frontend can show "Left" employees
    const payRegisters = await PayRegisterSummary.find({
      employeeId: { $in: employeeIds },
      month
    })
      .populate('employeeId', 'employee_name emp_no department_id designation_id leftDate leftReason')
      .select('employeeId emp_no month status totals lastEditedAt dailyRecords startDate endDate totalDaysInMonth summaryLocked summaryLockedAt');

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
        totalPages: limitNum === -1 ? 1 : Math.ceil(totalEmployees / limitNum)
      }
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

    const result = await processSummaryBulkUpload(month, data, req.user._id);

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
// @desc    Export monthly summary as Excel
// @route   GET /api/pay-register/export-summary/:month
// @access  Private (exclude employee)
exports.exportSummaryExcel = async (req, res) => {
  try {
    const { month } = req.params;
    const { departmentId, divisionId } = req.query;

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

    let employeeQuery = {
      $or: [
        { is_active: true, leftDate: null },
        { leftDate: { $gte: rangeStart, $lte: rangeEnd } }
      ]
    };

    if (departmentId) employeeQuery.department_id = departmentId;
    if (divisionId) employeeQuery.division_id = divisionId;

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
        'Late Count': totals.lateCount || 0,
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
