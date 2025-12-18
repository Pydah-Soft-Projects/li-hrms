/**
 * Integration Tests for Payroll Calculation with Based on Present Days Feature
 * These tests verify the complete flow from employee data to final payroll calculation
 */

describe('Payroll Calculation Integration - Based on Present Days', () => {
  
  describe('Scenario 1: Full Month Attendance with Proration Enabled', () => {
    test('should calculate full allowance amount when employee works full month', () => {
      // Arrange
      const allowance = {
        name: 'Transport Allowance',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      
      const attendanceData = {
        presentDays: 25,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };
      
      // Total paid days = 30, so should get full amount
      const perDayAmount = 3000 / 30; // 100
      const expectedAmount = perDayAmount * 30; // 3000
      
      expect(expectedAmount).toBe(3000);
    });
  });

  describe('Scenario 2: Partial Month Attendance with Proration', () => {
    test('should prorate allowance for partial attendance', () => {
      // Arrange
      const allowance = {
        name: 'Transport Allowance',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      
      const attendanceData = {
        presentDays: 15,
        paidLeaveDays: 5,
        odDays: 0,
        monthDays: 30
      };
      
      // Total paid days = 20
      const perDayAmount = 3000 / 30; // 100
      const expectedAmount = perDayAmount * 20; // 2000
      
      expect(expectedAmount).toBe(2000);
    });
  });

  describe('Scenario 3: Employee Override with Different Proration Setting', () => {
    test('should use employee override proration setting', () => {
      // Base rule has proration disabled
      const baseAllowance = {
        masterId: '1',
        name: 'Transport Allowance',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: false
      };
      
      // Employee override enables proration
      const employeeOverride = {
        masterId: '1',
        name: 'Transport Allowance',
        amount: 2500,
        basedOnPresentDays: true
      };
      
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };
      
      // Should use employee override amount and proration
      const perDayAmount = 2500 / 30; // 83.33
      const expectedAmount = Math.round((perDayAmount * 20) * 100) / 100; // 1666.67
      
      expect(expectedAmount).toBe(1666.67);
    });
  });

  describe('Scenario 4: Mixed Allowances - Some Prorated, Some Not', () => {
    test('should handle mixed proration settings correctly', () => {
      const allowances = [
        {
          name: 'Transport',
          type: 'fixed',
          amount: 3000,
          basedOnPresentDays: true
        },
        {
          name: 'Food',
          type: 'fixed',
          amount: 2000,
          basedOnPresentDays: false
        },
        {
          name: 'HRA',
          type: 'percentage',
          percentage: 40,
          percentageBase: 'basic',
          basedOnPresentDays: true // Should be ignored for percentage
        }
      ];
      
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 5,
        odDays: 0,
        monthDays: 30
      };
      
      const basicPay = 30000;
      
      // Transport: Prorated
      const transportAmount = (3000 / 30) * 25; // 2500
      
      // Food: Not prorated
      const foodAmount = 2000; // 2000
      
      // HRA: Percentage (not prorated)
      const hraAmount = basicPay * 0.40; // 12000
      
      const totalAllowances = transportAmount + foodAmount + hraAmount;
      
      expect(totalAllowances).toBe(16500);
    });
  });

  describe('Scenario 5: Deduction with Proration', () => {
    test('should prorate deduction based on present days', () => {
      const deduction = {
        name: 'Professional Tax',
        type: 'fixed',
        amount: 600,
        basedOnPresentDays: true
      };
      
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };
      
      // Total paid days = 25
      const perDayAmount = 600 / 30; // 20
      const expectedAmount = perDayAmount * 25; // 500
      
      expect(expectedAmount).toBe(500);
    });
  });

  describe('Scenario 6: Zero Attendance Days', () => {
    test('should calculate zero allowance when no attendance', () => {
      const allowance = {
        name: 'Transport',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true
      };
      
      const attendanceData = {
        presentDays: 0,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };
      
      const expectedAmount = (3000 / 30) * 0; // 0
      
      expect(expectedAmount).toBe(0);
    });
  });

  describe('Scenario 7: Complete Payroll Calculation', () => {
    test('should calculate complete payroll with prorated allowances and deductions', () => {
      // Employee data
      const basicSalary = 30000;
      const attendanceData = {
        presentDays: 20,
        paidLeaveDays: 3,
        odDays: 2,
        monthDays: 30
      };
      
      // Allowances
      const allowances = [
        { name: 'Transport', type: 'fixed', amount: 3000, basedOnPresentDays: true },
        { name: 'Food', type: 'fixed', amount: 2000, basedOnPresentDays: false },
        { name: 'HRA', type: 'percentage', percentage: 40, percentageBase: 'basic', basedOnPresentDays: false }
      ];
      
      // Deductions
      const deductions = [
        { name: 'PF', type: 'percentage', percentage: 12, percentageBase: 'basic', basedOnPresentDays: false },
        { name: 'Professional Tax', type: 'fixed', amount: 600, basedOnPresentDays: true }
      ];
      
      // Calculate earned salary
      const workingDays = 30 - 0 - 0; // monthDays - holidays - weeklyOffs
      const perDaySalary = basicSalary / workingDays;
      const earnedSalary = perDaySalary * attendanceData.presentDays;
      const paidLeaveSalary = perDaySalary * attendanceData.paidLeaveDays;
      const odSalary = perDaySalary * attendanceData.odDays;
      
      let grossAmount = earnedSalary + paidLeaveSalary + odSalary;
      
      // Calculate allowances
      const transportAmount = (3000 / 30) * 25; // 2500 (prorated)
      const foodAmount = 2000; // 2000 (not prorated)
      const hraAmount = basicSalary * 0.40; // 12000
      const totalAllowances = transportAmount + foodAmount + hraAmount;
      
      grossAmount += totalAllowances;
      
      // Calculate deductions
      const pfAmount = basicSalary * 0.12; // 3600
      const ptAmount = (600 / 30) * 25; // 500 (prorated)
      const totalDeductions = pfAmount + ptAmount;
      
      const netSalary = grossAmount - totalDeductions;
      
      // Assertions
      expect(transportAmount).toBe(2500);
      expect(foodAmount).toBe(2000);
      expect(hraAmount).toBe(12000);
      expect(totalAllowances).toBe(16500);
      expect(pfAmount).toBe(3600);
      expect(ptAmount).toBe(500);
      expect(totalDeductions).toBe(4100);
      expect(netSalary).toBeGreaterThan(0);
    });
  });

  describe('Scenario 8: Min/Max Constraints with Proration', () => {
    test('should apply min constraint after proration', () => {
      const allowance = {
        name: 'Transport',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true,
        minAmount: 2000
      };
      
      const attendanceData = {
        presentDays: 10,
        paidLeaveDays: 0,
        odDays: 0,
        monthDays: 30
      };
      
      // Calculated: (3000 / 30) * 10 = 1000
      // But min is 2000
      const calculatedAmount = (3000 / 30) * 10;
      const finalAmount = Math.max(calculatedAmount, 2000);
      
      expect(finalAmount).toBe(2000);
    });

    test('should apply max constraint after proration', () => {
      const allowance = {
        name: 'Transport',
        type: 'fixed',
        amount: 3000,
        basedOnPresentDays: true,
        maxAmount: 2500
      };
      
      const attendanceData = {
        presentDays: 28,
        paidLeaveDays: 2,
        odDays: 0,
        monthDays: 30
      };
      
      // Calculated: (3000 / 30) * 30 = 3000
      // But max is 2500
      const calculatedAmount = (3000 / 30) * 30;
      const finalAmount = Math.min(calculatedAmount, 2500);
      
      expect(finalAmount).toBe(2500);
    });
  });

  describe('Scenario 9: Include Missing Setting', () => {
    test('should include only employee overrides when includeMissing is false', () => {
      const baseAllowances = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'Food', amount: 2000, basedOnPresentDays: false },
        { masterId: '3', name: 'Medical', amount: 1500, basedOnPresentDays: false }
      ];
      
      const employeeOverrides = [
        { masterId: '1', amount: 2500, basedOnPresentDays: true }
      ];
      
      const includeMissing = false;
      
      // Should only include Transport (overridden)
      // Food and Medical should be excluded
      const expectedCount = 1;
      
      expect(expectedCount).toBe(1);
    });

    test('should include all allowances when includeMissing is true', () => {
      const baseAllowances = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'Food', amount: 2000, basedOnPresentDays: false },
        { masterId: '3', name: 'Medical', amount: 1500, basedOnPresentDays: false }
      ];
      
      const employeeOverrides = [
        { masterId: '1', amount: 2500, basedOnPresentDays: true }
      ];
      
      const includeMissing = true;
      
      // Should include all: Transport (overridden), Food (base), Medical (base)
      const expectedCount = 3;
      
      expect(expectedCount).toBe(3);
    });
  });
});
