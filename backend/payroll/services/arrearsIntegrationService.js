const ArrearsRequest = require('../../arrears/model/ArrearsRequest');
const ArrearsPayrollIntegrationService = require('../../arrears/services/arrearsPayrollIntegrationService');

/**
 * Service to handle arrears integration with payroll calculations
 * This service is called during payroll calculation to include arrears
 */
class ArrearsIntegrationService {
  /**
   * Get pending arrears for payroll display
   * Called during payroll calculation to show pending arrears
   * @param {String} employeeId - Employee ID
   * @returns {Object} Arrears component for payroll
   */
  static async getArrearsForPayroll(employeeId) {
    try {
      const pendingArrears = await ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(employeeId);
      
      if (pendingArrears.length === 0) {
        return null;
      }

      return ArrearsPayrollIntegrationService.buildArrearsComponent(pendingArrears);
    } catch (error) {
      console.error('Error getting arrears for payroll:', error);
      return null;
    }
  }

  /**
   * Add arrears to payroll earnings
   * Called after payroll calculation to include settled arrears
   * @param {Object} payrollRecord - Payroll record
   * @param {Array} arrearsSettlements - Array of settlement objects
   * @param {String} employeeId - Employee ID
   * @returns {Object} Updated payroll record with arrears
   */
  static async addArrearsToPayroll(payrollRecord, arrearsSettlements, employeeId) {
    try {
      if (!arrearsSettlements || arrearsSettlements.length === 0) {
        return payrollRecord;
      }

      // Validate settlements
      const validation = await ArrearsPayrollIntegrationService.validateSettlements(
        employeeId,
        arrearsSettlements
      );

      if (!validation.valid) {
        throw new Error(`Invalid arrears settlements: ${validation.errors.join(', ')}`);
      }

      // Get pending arrears for reference
      const pendingArrears = await ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(employeeId);

      // Create arrears earning component
      const arrearsComponent = ArrearsPayrollIntegrationService.createArrearsEarningComponent(
        arrearsSettlements,
        pendingArrears
      );

      if (!arrearsComponent) {
        return payrollRecord;
      }

      // Add to earnings
      if (!payrollRecord.earnings.allowances) {
        payrollRecord.earnings.allowances = [];
      }

      // Add arrears as a fixed allowance
      payrollRecord.earnings.allowances.push({
        name: arrearsComponent.name,
        type: 'fixed', // Changed from arrearsComponent.type to 'fixed' to match schema
        amount: arrearsComponent.amount,
        description: arrearsComponent.description,
        // Add details as a custom field to store arrears information
        details: arrearsComponent.details,
        // Add a flag to identify this as an arrears allowance
        isArrears: true
      });

      // Update total allowances
      payrollRecord.earnings.totalAllowances = (payrollRecord.earnings.totalAllowances || 0) + arrearsComponent.amount;

      // Store arrears settlements for reference
      payrollRecord.arrearsSettlements = arrearsSettlements;
      payrollRecord.arrearsAmount = arrearsComponent.amount;

      return payrollRecord;
    } catch (error) {
      console.error('Error adding arrears to payroll:', error);
      throw error;
    }
  }

  /**
   * Process arrears settlements after payroll is saved
   * @param {String} employeeId - Employee ID
   * @param {String} month - Month in YYYY-MM format
   * @param {Array} arrearsSettlements - Array of settlement objects
   * @param {String} userId - User ID
   * @param {String} payrollId - Payroll record ID
   * @returns {Array} Settlement results
   */
  static async processArrearsSettlements(employeeId, month, arrearsSettlements, userId, payrollId) {
    try {
      if (!arrearsSettlements || arrearsSettlements.length === 0) {
        return [];
      }

      // Use ArrearsService to process settlements
      const ArrearsService = require('../../arrears/services/arrearsService');
      const results = await ArrearsService.processSettlement(
        employeeId,
        month,
        arrearsSettlements,
        userId,
        payrollId
      );

      return results;
    } catch (error) {
      console.error('Error processing arrears settlements:', error);
      throw error;
    }
  }

  /**
   * Get arrears summary for payroll report
   * @param {String} employeeId - Employee ID
   * @param {String} month - Month in YYYY-MM format
   * @returns {Object} Arrears summary
   */
  static async getArrearsSummaryForPayroll(employeeId, month) {
    try {
      return await ArrearsPayrollIntegrationService.getArrearsSummary(employeeId, month);
    } catch (error) {
      console.error('Error getting arrears summary:', error);
      return null;
    }
  }

  /**
   * Check if employee has pending arrears
   * @param {String} employeeId - Employee ID
   * @returns {Boolean} True if pending arrears exist
   */
  static async hasPendingArrears(employeeId) {
    try {
      return await ArrearsPayrollIntegrationService.hasPendingArrears(employeeId);
    } catch (error) {
      console.error('Error checking pending arrears:', error);
      return false;
    }
  }

  /**
   * Build arrears section for payroll display
   * This is used in payroll forms to show arrears details
   * @param {String} employeeId - Employee ID
   * @returns {Object} Arrears section for display
   */
  static async buildArrearsSection(employeeId) {
    try {
      const pendingArrears = await ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(employeeId);
      
      if (pendingArrears.length === 0) {
        return null;
      }

      return {
        hasPendingArrears: true,
        count: pendingArrears.length,
        totalPendingAmount: pendingArrears.reduce((sum, ar) => sum + ar.remainingAmount, 0),
        arrears: pendingArrears.map(ar => ({
          id: ar.id.toString(),
          period: `${ar.startMonth} to ${ar.endMonth}`,
          reason: ar.reason,
          totalAmount: ar.totalAmount,
          settledAmount: ar.settledAmount,
          remainingAmount: ar.remainingAmount,
          settlementHistory: ar.settlementHistory.map(s => ({
            month: s.month,
            amount: s.amount,
            settledAt: s.settledAt
          }))
        }))
      };
    } catch (error) {
      console.error('Error building arrears section:', error);
      return null;
    }
  }
}

module.exports = ArrearsIntegrationService;
