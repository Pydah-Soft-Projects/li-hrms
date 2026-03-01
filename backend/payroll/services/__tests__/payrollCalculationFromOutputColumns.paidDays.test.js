/**
 * Tests: Allowances, other deductions, and statutory use the dynamic payroll config's
 * "paid days" column value for proration when available; fallbacks when column not found.
 */

const allowanceService = require('../allowanceService');
const deductionService = require('../deductionService');
const { getPaidDaysAndTotalDaysFromContext } = require('../payrollCalculationFromOutputColumnsService');

describe('Paid days from output column – proration for allowances, deductions, statutory', () => {

  describe('getPaidDaysAndTotalDaysFromContext', () => {
    test('returns paid days and total days from context when column name matches (auto-detect by name)', () => {
      const colContext = { paid_days: 22, month_days: 30 };
      const config = {};
      const result = getPaidDaysAndTotalDaysFromContext(colContext, config);
      expect(result.paidDays).toBe(22);
      expect(result.totalDaysInMonth).toBe(30);
    });

    test('returns paid days from config header when statutoryProratePaidDaysColumnHeader is set', () => {
      const colContext = { paid_days: 18, working_days: 20 };
      const config = { statutoryProratePaidDaysColumnHeader: 'Paid Days', statutoryProrateTotalDaysColumnHeader: 'Month days' };
      const result = getPaidDaysAndTotalDaysFromContext(colContext, config);
      expect(result.paidDays).toBe(18);
      expect(result.totalDaysInMonth).toBeNull();
    });

    test('returns nulls when context is empty (no paid days column found)', () => {
      const colContext = { basic_pay: 30000, gross_salary: 35000 };
      const result = getPaidDaysAndTotalDaysFromContext(colContext, {});
      expect(result.paidDays).toBeNull();
      expect(result.totalDaysInMonth).toBeNull();
    });

    test('returns nulls when context is null/undefined', () => {
      expect(getPaidDaysAndTotalDaysFromContext(null, {})).toEqual({ paidDays: null, totalDaysInMonth: null });
      expect(getPaidDaysAndTotalDaysFromContext(undefined, {})).toEqual({ paidDays: null, totalDaysInMonth: null });
    });
  });

  describe('Allowance proration using paid days from column (totalPaidDays / totalDaysInMonth)', () => {
    test('prorates by totalPaidDays and totalDaysInMonth when provided (as from output column)', () => {
      const rule = { type: 'fixed', amount: 3000, basedOnPresentDays: true, name: 'Transport' };
      const attendanceData = { totalPaidDays: 22, totalDaysInMonth: 30 };
      const result = allowanceService.calculateAllowanceAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(2200); // 3000/30*22
    });

    test('fallback: when totalPaidDays not provided, uses presentDays + paidLeaveDays + odDays', () => {
      const rule = { type: 'fixed', amount: 3000, basedOnPresentDays: true, name: 'Transport' };
      const attendanceData = { presentDays: 20, paidLeaveDays: 2, odDays: 0, monthDays: 30 };
      const result = allowanceService.calculateAllowanceAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(2200); // 20+2+0 = 22, 3000/30*22
    });

    test('fallback: zero paid days from column-like input gives zero amount', () => {
      const rule = { type: 'fixed', amount: 3000, basedOnPresentDays: true };
      const attendanceData = { totalPaidDays: 0, totalDaysInMonth: 30 };
      const result = allowanceService.calculateAllowanceAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(0);
    });
  });

  describe('Deduction proration using paid days from column (totalPaidDays / totalDaysInMonth)', () => {
    test('prorates by totalPaidDays and totalDaysInMonth when provided (as from output column)', () => {
      const rule = { type: 'fixed', amount: 600, basedOnPresentDays: true, name: 'Professional Tax' };
      const attendanceData = { totalPaidDays: 22, totalDaysInMonth: 30 };
      const result = deductionService.calculateDeductionAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(440); // 600/30*22
    });

    test('fallback: when totalPaidDays not provided, uses presentDays + paidLeaveDays + odDays', () => {
      const rule = { type: 'fixed', amount: 600, basedOnPresentDays: true, name: 'PT' };
      const attendanceData = { presentDays: 20, paidLeaveDays: 2, odDays: 0, monthDays: 30 };
      const result = deductionService.calculateDeductionAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(440); // 600/30*22
    });

    test('fallback: zero paid days gives zero deduction', () => {
      const rule = { type: 'fixed', amount: 600, basedOnPresentDays: true };
      const attendanceData = { totalPaidDays: 0, totalDaysInMonth: 30 };
      const result = deductionService.calculateDeductionAmount(rule, 30000, null, attendanceData);
      expect(result).toBe(0);
    });
  });

});
