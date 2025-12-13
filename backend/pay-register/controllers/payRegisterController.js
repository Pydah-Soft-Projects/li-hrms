const PayRegisterSummary = require('../model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const { populatePayRegisterFromSources } = require('../services/autoPopulationService');
const { calculateTotals } = require('../services/totalsCalculationService');
const { updateDailyRecord } = require('../services/dailyRecordUpdateService');
const { manualSyncPayRegister } = require('../services/autoSyncService');

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
      const dailyRecords = await populatePayRegisterFromSources(
        employeeId,
        employee.emp_no,
        year,
        monthNum
      );

      payRegister = await PayRegisterSummary.create({
        employeeId,
        emp_no: employee.emp_no,
        month,
        monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        year,
        monthNumber: monthNum,
        totalDaysInMonth: new Date(year, monthNum, 0).getDate(),
        dailyRecords,
        totals: calculateTotals(dailyRecords),
        status: 'draft',
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
    const dailyRecords = await populatePayRegisterFromSources(
      employeeId,
      employee.emp_no,
      year,
      monthNum
    );

    const payRegister = await PayRegisterSummary.create({
      employeeId,
      emp_no: employee.emp_no,
      month,
      monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
      year,
      monthNumber: monthNum,
      totalDaysInMonth: new Date(year, monthNum, 0).getDate(),
      dailyRecords,
      totals: calculateTotals(dailyRecords),
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

    // Update dailyRecords if provided
    if (dailyRecords && Array.isArray(dailyRecords)) {
      payRegister.dailyRecords = dailyRecords;
      payRegister.totals = calculateTotals(dailyRecords);
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

    // Validate date is within the month
    if (!date.startsWith(month)) {
      return res.status(400).json({
        success: false,
        error: 'Date must be within the specified month',
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

    // Recalculate totals
    payRegister.totals = calculateTotals(payRegister.dailyRecords);
    payRegister.recalculateTotals(); // Also use model method

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

    const payRegister = await manualSyncPayRegister(employeeId, month);

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
    const { departmentId, status } = req.query;

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        error: 'Month must be in YYYY-MM format',
      });
    }

    const query = { month };
    if (status) {
      query.status = status;
    }

    const payRegisters = await PayRegisterSummary.find(query)
      .populate('employeeId', 'employee_name emp_no department_id designation_id')
      .select('employeeId emp_no month status totals lastEditedAt')
      .sort({ 'employeeId.employee_name': 1 });

    // Filter by department if provided
    let filteredPayRegisters = payRegisters;
    if (departmentId) {
      filteredPayRegisters = payRegisters.filter(
        (pr) => pr.employeeId && pr.employeeId.department_id?.toString() === departmentId
      );
    }

    res.status(200).json({
      success: true,
      count: filteredPayRegisters.length,
      data: filteredPayRegisters,
    });
  } catch (error) {
    console.error('Error getting employees with pay register:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get employees with pay register',
    });
  }
};

