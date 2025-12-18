const allowanceService = require('../allowanceService');

describe('Allowance Service - Based on Present Days', () => {
  describe('calculateAllowanceAmount', () => {
    
    test('should calculate fixed allowance without proration when basedOnPresentDays is false', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: false
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      expect(result).toBe(3000);
    });

    test('should prorate fixed allowance when basedOnPresentDays is true', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true,
        name: 'Transport Allowance'
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3000 / 30) * (20 + 3 + 2) = 100 * 25 = 2500
      expect(result).toBe(2500);
    });

    test('should calculate full amount when total paid days equals month days', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 25,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3000 / 30) * 30 = 3000
      expect(result).toBe(3000);
    });

    test('should handle zero present days', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 0,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3000 / 30) * 0 = 0
      expect(result).toBe(0);
    });

    test('should not prorate when attendanceData is null', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      const basicPay = 30000;

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, null);
      
      // Expected: 3000 (no proration without attendance data)
      expect(result).toBe(3000);
    });

    test('should not prorate percentage-based allowances', () => {
      const rule = {
        type: 'percentage',
        percentage: 10,
        percentageBase: 'basic',
        basedOnPresentDays: true // Should be ignored for percentage type
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 15,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: 30000 * 10% = 3000 (no proration for percentage)
      expect(result).toBe(3000);
    });

    test('should apply min constraint after proration', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true,
        minAmount: 2000
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 10,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Calculated: (3000 / 30) * 10 = 1000
      // But min is 2000, so result should be 2000
      expect(result).toBe(2000);
    });

    test('should apply max constraint after proration', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true,
        maxAmount: 2500
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 28,
        paidLeaveDays: 2,
        odDays: 0,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Calculated: (3000 / 30) * 30 = 3000
      // But max is 2500, so result should be 2500
      expect(result).toBe(2500);
    });

    test('should handle decimal results correctly', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 22,
        paidLeaveDays: 1,
        odDays: 1,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3000 / 30) * 24 = 2400
      expect(result).toBe(2400);
    });

    test('should round to 2 decimal places', () => {
      const rule = {
        type: 'fixed',
        amount: 3333,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3333 / 30) * 25 = 2777.5
      expect(result).toBe(2777.5);
    });

    test('should return 0 when rule is null', () => {
      const result = allowanceService.calculateAllowanceAmount(null, 30000, null, null);
      expect(result).toBe(0);
    });

    test('should handle missing attendance data fields', () => {
      const rule = {
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        // Missing paidLeaveDays and odDays
        monthDays: 30
      };

      const result = allowanceService.calculateAllowanceAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (3000 / 30) * (20 + 0 + 0) = 2000
      expect(result).toBe(2000);
    });
  });
});
