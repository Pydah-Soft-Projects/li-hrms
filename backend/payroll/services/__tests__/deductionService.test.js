const deductionService = require('../deductionService');

describe('Deduction Service - Based on Present Days', () => {
  describe('calculateDeductionAmount', () => {
    
    test('should calculate fixed deduction without proration when basedOnPresentDays is false', () => {
      const rule = {
        type: 'fixed',
        amount: 500,
        basedOnPresentDays: false
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      expect(result).toBe(500);
    });

    test('should prorate fixed deduction when basedOnPresentDays is true', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true,
        name: 'Professional Tax'
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (600 / 30) * (20 + 3 + 2) = 20 * 25 = 500
      expect(result).toBe(500);
    });

    test('should calculate full amount when total paid days equals month days', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 25,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (600 / 30) * 30 = 600
      expect(result).toBe(600);
    });

    test('should handle zero present days', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 0,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (600 / 30) * 0 = 0
      expect(result).toBe(0);
    });

    test('should not prorate when attendanceData is null', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true
      };
      const basicPay = 30000;

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, null);
      
      // Expected: 600 (no proration without attendance data)
      expect(result).toBe(600);
    });

    test('should not prorate percentage-based deductions', () => {
      const rule = {
        type: 'percentage',
        percentage: 12,
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

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: 30000 * 12% = 3600 (no proration for percentage)
      expect(result).toBe(3600);
    });

    test('should apply min constraint after proration', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true,
        minAmount: 400
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 10,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Calculated: (600 / 30) * 10 = 200
      // But min is 400, so result should be 400
      expect(result).toBe(400);
    });

    test('should apply max constraint after proration', () => {
      const rule = {
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true,
        maxAmount: 500
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 28,
        paidLeaveDays: 2,
        odDays: 0,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Calculated: (600 / 30) * 30 = 600
      // But max is 500, so result should be 500
      expect(result).toBe(500);
    });

    test('should handle partial month correctly', () => {
      const rule = {
        type: 'fixed',
        amount: 900,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 15,
        paidLeaveDays: 5,
        odDays: 0,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (900 / 30) * 20 = 600
      expect(result).toBe(600);
    });

    test('should round to 2 decimal places', () => {
      const rule = {
        type: 'fixed',
        amount: 777,
        basedOnPresentDays: true
      };
      const basicPay = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, null, attendanceData);
      
      // Expected: (777 / 30) * 25 = 647.5
      expect(result).toBe(647.5);
    });

    test('should return 0 when rule is null', () => {
      const result = deductionService.calculateDeductionAmount(null, 30000, null, null);
      expect(result).toBe(0);
    });

    test('should handle gross salary base for percentage', () => {
      const rule = {
        type: 'percentage',
        percentage: 10,
        percentageBase: 'gross',
        basedOnPresentDays: false
      };
      const basicPay = 30000;
      const grossSalary = 35000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 5,
        odDays: 0,
        monthDays: 30
      };

      const result = deductionService.calculateDeductionAmount(rule, basicPay, grossSalary, attendanceData);
      
      // Expected: 35000 * 10% = 3500
      expect(result).toBe(3500);
    });
  });

  describe('Free limit & effective count (permission/attendance deduction)', () => {
    const perDayBasicPay = 1000;

    test('effectiveCount = total - freeAllowed: 5 permissions, free 3 → effective 2', () => {
      const total = 5;
      const freeAllowed = 3;
      const effectiveCount = Math.max(0, total - freeAllowed);
      expect(effectiveCount).toBe(2);
    });

    test('effectiveCount = total - freeAllowed: 3 permissions, free 3 → effective 0', () => {
      const total = 3;
      const freeAllowed = 3;
      const effectiveCount = Math.max(0, total - freeAllowed);
      expect(effectiveCount).toBe(0);
    });

    test('effectiveCount never negative when total < freeAllowed', () => {
      const total = 2;
      const freeAllowed = 5;
      const effectiveCount = Math.max(0, total - freeAllowed);
      expect(effectiveCount).toBe(0);
    });

    test('threshold applied on effectiveCount: 6 effective, threshold 3, full_day floor → 2 days', () => {
      const effectiveCount = 6;
      const threshold = 3;
      const multiplier = Math.floor(effectiveCount / threshold);
      const remainder = effectiveCount % threshold;
      const days = deductionService.calculateDaysToDeduct(
        multiplier,
        remainder,
        threshold,
        'full_day',
        null,
        null,
        perDayBasicPay,
        'floor'
      );
      expect(days).toBe(2);
    });

    test('threshold applied on effectiveCount: 3 effective, threshold 3, full_day floor → 1 day', () => {
      const effectiveCount = 3;
      const threshold = 3;
      const multiplier = Math.floor(effectiveCount / threshold);
      const remainder = effectiveCount % threshold;
      const days = deductionService.calculateDaysToDeduct(
        multiplier,
        remainder,
        threshold,
        'full_day',
        null,
        null,
        perDayBasicPay,
        'floor'
      );
      expect(days).toBe(1);
    });

    test('2 effective, threshold 3, full_day proportional → 0.67 days', () => {
      const effectiveCount = 2;
      const threshold = 3;
      const multiplier = Math.floor(effectiveCount / threshold);
      const remainder = effectiveCount % threshold;
      const days = deductionService.calculateDaysToDeduct(
        multiplier,
        remainder,
        threshold,
        'full_day',
        null,
        null,
        perDayBasicPay,
        'proportional'
      );
      expect(days).toBe(0.67);
    });

    test('custom_days 1.5 per unit: 3 effective, threshold 3, floor → 1.5 days', () => {
      const effectiveCount = 3;
      const threshold = 3;
      const multiplier = Math.floor(effectiveCount / threshold);
      const remainder = effectiveCount % threshold;
      const days = deductionService.calculateDaysToDeduct(
        multiplier,
        remainder,
        threshold,
        'custom_days',
        1.5,
        null,
        perDayBasicPay,
        'floor'
      );
      expect(days).toBe(1.5);
    });
  });
});
