const ArrearsRequest = require('../model/ArrearsRequest');

/**
 * Service to integrate arrears with payroll calculations
 */
class ArrearsPayrollIntegrationService {
  /**
   * Get pending arrears for an employee during payroll calculation
   * Returns arrears that are approved and have remaining amount to settle
   * @param {String} employeeId - Employee ID
   * @returns {Array} Array of pending arrears with settlement details
   */
  static async getPendingArrearsForPayroll(employeeId) {
    try {
      const arrears = await ArrearsRequest.find({
        employee: employeeId,
        status: { $in: ['approved', 'partially_settled'] },
        remainingAmount: { $gt: 0 }
      })
        .sort({ createdAt: 1 })
        .lean();

      return arrears.map(ar => ({
        id: ar._id,
        type: ar.type || 'incremental',
        startMonth: ar.startMonth,
        endMonth: ar.endMonth,
        totalAmount: ar.totalAmount,
        remainingAmount: ar.remainingAmount,
        settledAmount: ar.settlementHistory.reduce((sum, s) => sum + s.amount, 0),
        settlementHistory: ar.settlementHistory || [],
        reason: ar.reason
      }));
    } catch (error) {
      throw new Error(`Failed to fetch pending arrears: ${error.message}`);
    }
  }

  /**
   * Build arrears component for payroll display
   * This is used to show arrears in the payroll form before settlement
   * @param {Array} pendingArrears - Array of pending arrears
   * @returns {Object} Arrears component with details
   */
  static buildArrearsComponent(pendingArrears) {
    if (!pendingArrears || pendingArrears.length === 0) {
      return null;
    }

    const totalPendingAmount = pendingArrears.reduce((sum, ar) => sum + ar.remainingAmount, 0);

    return {
      type: 'arrears',
      description: 'Pending Arrears',
      totalAmount: totalPendingAmount,
      details: pendingArrears.map(ar => ({
        id: ar.id.toString(),
        type: ar.type || 'incremental',
        period: ar.type === 'direct' ? 'Direct' : (ar.startMonth && ar.endMonth ? `${ar.startMonth} to ${ar.endMonth}` : 'N/A'),
        reason: ar.reason,
        totalAmount: ar.totalAmount,
        settledAmount: ar.settledAmount,
        remainingAmount: ar.remainingAmount,
        settlementHistory: ar.settlementHistory
      }))
    };
  }

  /**
   * Validate arrears settlements before processing
   * @param {String} employeeId - Employee ID
   * @param {Array} settlements - Array of settlement objects {arrearId, amount}
   * @returns {Object} Validation result {valid: boolean, errors: []}
   */
  static async validateSettlements(employeeId, settlements) {
    const errors = [];

    if (!settlements || !Array.isArray(settlements) || settlements.length === 0) {
      return { valid: true, errors: [] }; // No settlements is valid
    }

    try {
      for (const settlement of settlements) {
        if (!settlement.arrearId || settlement.amount === undefined) {
          errors.push('Invalid settlement format: missing arrearId or amount');
          continue;
        }

        const arrear = await ArrearsRequest.findById(settlement.arrearId);

        if (!arrear) {
          errors.push(`Arrear ${settlement.arrearId} not found`);
          continue;
        }

        if (arrear.employee.toString() !== employeeId) {
          errors.push(`Arrear ${settlement.arrearId} does not belong to employee`);
          continue;
        }

        if (!['approved', 'partially_settled'].includes(arrear.status)) {
          errors.push(`Arrear ${settlement.arrearId} is not approved for settlement`);
          continue;
        }

        if (settlement.amount <= 0) {
          errors.push(`Settlement amount for arrear ${settlement.arrearId} must be positive`);
          continue;
        }

        if (settlement.amount > arrear.remainingAmount) {
          errors.push(
            `Settlement amount (${settlement.amount}) exceeds remaining amount (${arrear.remainingAmount}) for arrear ${settlement.arrearId}`
          );
          continue;
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Calculate total arrears amount to be added to payroll
   * @param {Array} settlements - Array of settlement objects
   * @returns {Number} Total amount to add to payroll
   */
  static calculateTotalArrearsAmount(settlements) {
    if (!settlements || !Array.isArray(settlements)) {
      return 0;
    }

    return settlements.reduce((sum, settlement) => sum + (settlement.amount || 0), 0);
  }

  /**
   * Create arrears earning component for payroll record
   * @param {Array} settlements - Array of settlement objects
   * @param {Array} pendingArrears - Array of pending arrears
   * @returns {Object} Arrears earning component
   */
  static createArrearsEarningComponent(settlements, pendingArrears) {
    if (!settlements || settlements.length === 0) {
      return null;
    }

    const totalAmount = this.calculateTotalArrearsAmount(settlements);

    if (totalAmount <= 0) {
      return null;
    }

    // Build settlement details
    const details = settlements.map(settlement => {
      const arrear = pendingArrears.find(ar => ar.id.toString() === settlement.arrearId.toString());
      const period = arrear
        ? (arrear.type === 'direct' ? 'Direct' : (arrear.startMonth && arrear.endMonth ? `${arrear.startMonth} to ${arrear.endMonth}` : 'N/A'))
        : 'N/A';
      return {
        arrearId: settlement.arrearId,
        period,
        amount: settlement.amount,
        reason: arrear ? arrear.reason : 'N/A'
      };
    });

    return {
      name: 'Arrears Settlement',
      type: 'arrears',
      category: 'earning',
      amount: totalAmount,
      description: `Arrears payment for ${settlements.length} pending arrear(s)`,
      details
    };
  }

  /**
   * Get arrears summary for payroll report
   * @param {String} employeeId - Employee ID
   * @param {String} month - Month in YYYY-MM format
   * @returns {Object} Arrears summary
   */
  static async getArrearsSummary(employeeId, month) {
    try {
      const allArrears = await ArrearsRequest.find({
        employee: employeeId
      })
        .sort({ createdAt: -1 })
        .lean();

      const pendingArrears = allArrears.filter(
        ar => ['approved', 'partially_settled'].includes(ar.status) && ar.remainingAmount > 0
      );

      const settledArrears = allArrears.filter(ar => ar.status === 'settled');

      const rejectedArrears = allArrears.filter(ar => ar.status === 'rejected');

      return {
        total: allArrears.length,
        pending: {
          count: pendingArrears.length,
          totalAmount: pendingArrears.reduce((sum, ar) => sum + ar.remainingAmount, 0),
          details: pendingArrears
        },
        settled: {
          count: settledArrears.length,
          totalAmount: settledArrears.reduce((sum, ar) => sum + ar.totalAmount, 0),
          details: settledArrears
        },
        rejected: {
          count: rejectedArrears.length,
          details: rejectedArrears
        }
      };
    } catch (error) {
      throw new Error(`Failed to get arrears summary: ${error.message}`);
    }
  }

  /**
   * Check if arrears exist for employee
   * @param {String} employeeId - Employee ID
   * @returns {Boolean} True if pending arrears exist
   */
  static async hasPendingArrears(employeeId) {
    try {
      const count = await ArrearsRequest.countDocuments({
        employee: employeeId,
        status: { $in: ['approved', 'partially_settled'] },
        remainingAmount: { $gt: 0 }
      });

      return count > 0;
    } catch (error) {
      console.error('Error checking pending arrears:', error);
      return false;
    }
  }
}

module.exports = ArrearsPayrollIntegrationService;
