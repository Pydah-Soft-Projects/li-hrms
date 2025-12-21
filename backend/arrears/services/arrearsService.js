const mongoose = require('mongoose');
const ArrearsRequest = require('../model/ArrearsRequest');
const Employee = require('../../employees/model/Employee');

class ArrearsService {
  /**
   * Create new arrears request
   * @param {Object} data - Arrears data
   * @param {String} userId - User ID who created the request
   * @returns {Object} Created arrears request
   */
  static async createArrearsRequest(data, userId) {
    try {
      // Validate employee exists
      const employee = await Employee.findById(data.employee);
      if (!employee) {
        throw new Error('Employee not found');
      }

      // Validate months format
      if (!this.isValidMonthFormat(data.startMonth) || !this.isValidMonthFormat(data.endMonth)) {
        throw new Error('Invalid month format. Use YYYY-MM');
      }

      // Validate start month is before or equal to end month
      if (data.startMonth > data.endMonth) {
        throw new Error('Start month must be before or equal to end month');
      }

      // Calculate total amount based on breakdown if provided, else legacy calculation
      let calculatedTotal = 0;
      if (data.calculationBreakdown && Array.isArray(data.calculationBreakdown) && data.calculationBreakdown.length > 0) {
        calculatedTotal = data.calculationBreakdown.reduce((sum, item) => sum + item.proratedAmount, 0);
      } else {
        const monthCount = this.getMonthDifference(data.startMonth, data.endMonth);
        calculatedTotal = data.monthlyAmount * monthCount;
      }

      // Validate total amount matches calculation (allow small precision difference)
      if (Math.abs(data.totalAmount - calculatedTotal) > 0.05) {
        throw new Error(`Total amount mismatch. Calculated: ${calculatedTotal.toFixed(2)}, Provided: ${data.totalAmount}`);
      }

      const arrears = new ArrearsRequest({
        ...data,
        createdBy: userId,
        remainingAmount: data.totalAmount,
        status: 'draft'
      });

      await arrears.save();
      return arrears.populate('employee createdBy');
    } catch (error) {
      throw new Error(`Failed to create arrears request: ${error.message}`);
    }
  }

  /**
   * Submit arrears for HOD approval
   * @param {String} arrearsId - Arrears ID
   * @param {String} userId - User ID
   * @returns {Object} Updated arrears
   */
  static async submitForHodApproval(arrearsId, userId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId);
      if (!arrears) {
        throw new Error('Arrears request not found');
      }

      if (arrears.status !== 'draft') {
        throw new Error('Only draft arrears can be submitted for approval');
      }

      arrears.status = 'pending_hod';
      arrears.updatedBy = userId;
      await arrears.save();

      return arrears.populate('employee createdBy updatedBy');
    } catch (error) {
      throw new Error(`Failed to submit for HOD approval: ${error.message}`);
    }
  }

  /**
   * HOD approval
   * @param {String} arrearsId - Arrears ID
   * @param {Boolean} approved - Approval status
   * @param {String} comments - Comments
   * @param {String} userId - User ID
   * @returns {Object} Updated arrears
   */
  static async hodApprove(arrearsId, approved, comments, userId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId);
      if (!arrears) {
        throw new Error('Arrears request not found');
      }

      if (arrears.status !== 'pending_hod') {
        throw new Error('Arrears is not pending HOD approval');
      }

      arrears.hodApproval = {
        approved,
        approvedBy: userId,
        approvedAt: new Date(),
        comments
      };

      if (approved) {
        arrears.status = 'pending_hr';
      } else {
        arrears.status = 'rejected';
      }

      arrears.updatedBy = userId;
      await arrears.save();

      return arrears.populate('employee createdBy updatedBy hodApproval.approvedBy');
    } catch (error) {
      throw new Error(`Failed to process HOD approval: ${error.message}`);
    }
  }

  /**
   * HR approval
   * @param {String} arrearsId - Arrears ID
   * @param {Boolean} approved - Approval status
   * @param {String} comments - Comments
   * @param {String} userId - User ID
   * @returns {Object} Updated arrears
   */
  static async hrApprove(arrearsId, approved, comments, userId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId);
      if (!arrears) {
        throw new Error('Arrears request not found');
      }

      if (arrears.status !== 'pending_hr') {
        throw new Error('Arrears is not pending HR approval');
      }

      arrears.hrApproval = {
        approved,
        approvedBy: userId,
        approvedAt: new Date(),
        comments
      };

      if (approved) {
        arrears.status = 'pending_admin';
      } else {
        arrears.status = 'rejected';
      }

      arrears.updatedBy = userId;
      await arrears.save();

      return arrears.populate('employee createdBy updatedBy hrApproval.approvedBy');
    } catch (error) {
      throw new Error(`Failed to process HR approval: ${error.message}`);
    }
  }

  /**
   * Admin approval (final approval with optional modification)
   * @param {String} arrearsId - Arrears ID
   * @param {Boolean} approved - Approval status
   * @param {Number} modifiedAmount - Modified amount (optional)
   * @param {String} comments - Comments
   * @param {String} userId - User ID
   * @returns {Object} Updated arrears
   */
  static async adminApprove(arrearsId, approved, modifiedAmount, comments, userId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId);
      if (!arrears) {
        throw new Error('Arrears request not found');
      }

      if (arrears.status !== 'pending_admin') {
        throw new Error('Arrears is not pending admin approval');
      }

      // If modified amount is provided, validate it
      if (modifiedAmount !== undefined && modifiedAmount !== null) {
        if (modifiedAmount < 0) {
          throw new Error('Modified amount cannot be negative');
        }
        if (modifiedAmount > arrears.totalAmount) {
          throw new Error('Modified amount cannot exceed total amount');
        }
      }

      arrears.adminApproval = {
        approved,
        approvedBy: userId,
        approvedAt: new Date(),
        modifiedAmount: modifiedAmount || arrears.totalAmount,
        comments
      };

      if (approved) {
        arrears.status = 'approved';
        // Update remaining amount based on modified or original amount
        arrears.remainingAmount = modifiedAmount || arrears.totalAmount;
      } else {
        arrears.status = 'rejected';
      }

      arrears.updatedBy = userId;
      await arrears.save();

      return arrears.populate('employee createdBy updatedBy adminApproval.approvedBy');
    } catch (error) {
      throw new Error(`Failed to process admin approval: ${error.message}`);
    }
  }

  /**
   * Process arrears settlement
   * @param {String} employeeId - Employee ID
   * @param {String} month - Month (YYYY-MM)
   * @param {Array} arrearsSettlements - Array of settlement objects
   * @param {String} userId - User ID
   * @param {String} payrollId - Payroll ID
   * @returns {Array} Settlement results
   */
  static async processSettlement(employeeId, month, arrearsSettlements, userId, payrollId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const settlementDate = new Date();
      const results = [];

      for (const settlement of arrearsSettlements) {
        const ar = await ArrearsRequest.findById(settlement.arrearId).session(session);

        if (!ar) {
          continue;
        }

        // Validate employee match
        if (ar.employee.toString() !== employeeId) {
          throw new Error(`Arrears ${settlement.arrearId} does not belong to employee ${employeeId}`);
        }

        // Validate arrears is approved
        if (ar.status !== 'approved' && ar.status !== 'partially_settled') {
          throw new Error(`Arrears ${settlement.arrearId} is not approved for settlement`);
        }

        // Validate remaining amount
        if (ar.remainingAmount <= 0) {
          throw new Error(`Arrears ${settlement.arrearId} has no remaining amount to settle`);
        }

        // Calculate amount to settle
        const settleAmount = Math.min(ar.remainingAmount, settlement.amount);

        if (settleAmount <= 0) {
          throw new Error(`Invalid settlement amount for arrears ${settlement.arrearId}`);
        }

        // Update arrear
        ar.remainingAmount -= settleAmount;
        ar.status = ar.remainingAmount > 0 ? 'partially_settled' : 'settled';

        // Add to settlement history
        ar.settlementHistory.push({
          month,
          amount: settleAmount,
          settledAt: settlementDate,
          settledBy: userId,
          payrollId
        });

        ar.updatedBy = userId;
        await ar.save({ session });

        results.push({
          arrearId: ar._id,
          settledAmount: settleAmount,
          remainingAmount: ar.remainingAmount,
          status: ar.status
        });
      }

      await session.commitTransaction();
      return results;
    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Failed to process settlement: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  /**
   * Get employee's pending arrears
   * @param {String} employeeId - Employee ID
   * @returns {Array} Pending arrears
   */
  static async getEmployeePendingArrears(employeeId) {
    try {
      return await ArrearsRequest.find({
        employee: employeeId,
        status: { $in: ['approved', 'partially_settled'] },
        remainingAmount: { $gt: 0 }
      })
        .sort({ createdAt: 1 })
        .populate('createdBy', 'name email');
    } catch (error) {
      throw new Error(`Failed to fetch pending arrears: ${error.message}`);
    }
  }

  /**
   * Get arrears by ID with full details
   * @param {String} arrearsId - Arrears ID
   * @returns {Object} Arrears details
   */
  static async getArrearsById(arrearsId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId)
        .populate('employee', 'emp_no name')
        .populate('createdBy updatedBy', 'name email')
        .populate('hodApproval.approvedBy hrApproval.approvedBy adminApproval.approvedBy', 'name email')
        .populate('settlementHistory.settledBy', 'name email')
        .populate('settlementHistory.payrollId', '_id month');

      if (!arrears) {
        throw new Error('Arrears not found');
      }

      return arrears;
    } catch (error) {
      throw new Error(`Failed to fetch arrears: ${error.message}`);
    }
  }

  /**
   * Get all arrears with filters
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered arrears
   */
  static async getArrears(filters = {}) {
    try {
      const query = {};

      if (filters.employee) {
        query.employee = filters.employee;
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query.status = { $in: filters.status };
        } else {
          query.status = filters.status;
        }
      }

      if (filters.department) {
        // This would require a join with Employee collection
        const employees = await Employee.find({ department_id: filters.department });
        query.employee = { $in: employees.map(e => e._id) };
      }

      const arrears = await ArrearsRequest.find(query)
        .populate('employee', 'emp_no name')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

      return arrears;
    } catch (error) {
      throw new Error(`Failed to fetch arrears: ${error.message}`);
    }
  }

  /**
   * Cancel arrears request
   * @param {String} arrearsId - Arrears ID
   * @param {String} userId - User ID
   * @returns {Object} Updated arrears
   */
  static async cancelArrears(arrearsId, userId) {
    try {
      const arrears = await ArrearsRequest.findById(arrearsId);
      if (!arrears) {
        throw new Error('Arrears request not found');
      }

      // Can only cancel draft or rejected arrears
      if (!['draft', 'rejected'].includes(arrears.status)) {
        throw new Error('Only draft or rejected arrears can be cancelled');
      }

      arrears.status = 'cancelled';
      arrears.updatedBy = userId;
      await arrears.save();

      return arrears;
    } catch (error) {
      throw new Error(`Failed to cancel arrears: ${error.message}`);
    }
  }

  /**
   * Helper: Check if month format is valid (YYYY-MM)
   * @param {String} month - Month string
   * @returns {Boolean} Valid or not
   */
  static isValidMonthFormat(month) {
    const regex = /^\d{4}-\d{2}$/;
    if (!regex.test(month)) return false;

    const [year, monthNum] = month.split('-');
    const m = parseInt(monthNum);
    return m >= 1 && m <= 12;
  }

  /**
   * Helper: Get difference between two months
   * @param {String} startMonth - Start month (YYYY-MM)
   * @param {String} endMonth - End month (YYYY-MM)
   * @returns {Number} Number of months (inclusive)
   */
  static getMonthDifference(startMonth, endMonth) {
    const [startYear, startM] = startMonth.split('-').map(Number);
    const [endYear, endM] = endMonth.split('-').map(Number);

    const diff = (endYear - startYear) * 12 + (endM - startM) + 1;
    return Math.max(1, diff);
  }
}

module.exports = ArrearsService;
