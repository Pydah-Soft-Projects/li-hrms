const { mergeWithOverrides } = require('../allowanceDeductionResolverService');

describe('Allowance Deduction Resolver Service - Merge Logic', () => {
  describe('mergeWithOverrides', () => {
    
    test('should return base list when no overrides provided and includeMissing is true', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'HRA', amount: 5000, basedOnPresentDays: true }
      ];
      const overrides = [];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Transport');
      expect(result[1].name).toBe('HRA');
    });

    test('should return empty array when no overrides and includeMissing is false', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000 },
        { masterId: '2', name: 'HRA', amount: 5000 }
      ];
      const overrides = [];
      const includeMissing = false;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(0);
    });

    test('should override base item by masterId', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, type: 'fixed', basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', name: 'Transport', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2500);
      expect(result[0].basedOnPresentDays).toBe(true);
      expect(result[0].isEmployeeOverride).toBe(true);
    });

    test('should override base item by name when masterId not matched', () => {
      const baseList = [
        { masterId: '1', name: 'Transport Allowance', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '999', name: 'Transport Allowance', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2500);
      expect(result[0].basedOnPresentDays).toBe(true);
      expect(result[0].isEmployeeOverride).toBe(true);
    });

    test('should include non-overridden base items when includeMissing is true', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'HRA', amount: 5000, basedOnPresentDays: true },
        { masterId: '3', name: 'Medical', amount: 2000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', name: 'Transport', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(3);
      
      // First item should be overridden
      const transportItem = result.find(r => r.name === 'Transport');
      expect(transportItem.amount).toBe(2500);
      expect(transportItem.basedOnPresentDays).toBe(true);
      expect(transportItem.isEmployeeOverride).toBe(true);
      
      // Other items should be from base
      const hraItem = result.find(r => r.name === 'HRA');
      expect(hraItem.amount).toBe(5000);
      expect(hraItem.isEmployeeOverride).toBe(false);
      
      const medicalItem = result.find(r => r.name === 'Medical');
      expect(medicalItem.amount).toBe(2000);
      expect(medicalItem.isEmployeeOverride).toBe(false);
    });

    test('should exclude non-overridden base items when includeMissing is false', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'HRA', amount: 5000, basedOnPresentDays: true },
        { masterId: '3', name: 'Medical', amount: 2000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', name: 'Transport', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = false;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Transport');
      expect(result[0].amount).toBe(2500);
      expect(result[0].isEmployeeOverride).toBe(true);
    });

    test('should handle case-insensitive name matching', () => {
      const baseList = [
        { masterId: '1', name: 'Transport Allowance', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        { name: 'TRANSPORT ALLOWANCE', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2500);
      expect(result[0].basedOnPresentDays).toBe(true);
    });

    test('should preserve all base item properties in override', () => {
      const baseList = [
        { 
          masterId: '1', 
          name: 'Transport', 
          amount: 3000, 
          type: 'fixed',
          code: 'TRANS',
          basedOnPresentDays: false,
          minAmount: 1000,
          maxAmount: 5000
        }
      ];
      const overrides = [
        { masterId: '1', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Transport');
      expect(result[0].type).toBe('fixed');
      expect(result[0].code).toBe('TRANS');
      expect(result[0].amount).toBe(2500);
      expect(result[0].basedOnPresentDays).toBe(true);
      expect(result[0].minAmount).toBe(1000);
      expect(result[0].maxAmount).toBe(5000);
    });

    test('should handle multiple overrides', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false },
        { masterId: '2', name: 'HRA', amount: 5000, basedOnPresentDays: false },
        { masterId: '3', name: 'Medical', amount: 2000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', amount: 2500, basedOnPresentDays: true },
        { masterId: '3', amount: 1500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(3);
      
      const transportItem = result.find(r => r.name === 'Transport');
      expect(transportItem.amount).toBe(2500);
      expect(transportItem.basedOnPresentDays).toBe(true);
      
      const hraItem = result.find(r => r.name === 'HRA');
      expect(hraItem.amount).toBe(5000);
      expect(hraItem.basedOnPresentDays).toBe(false);
      
      const medicalItem = result.find(r => r.name === 'Medical');
      expect(medicalItem.amount).toBe(1500);
      expect(medicalItem.basedOnPresentDays).toBe(true);
    });

    test('should handle override with overrideAmount field', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', overrideAmount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2500);
    });

    test('should handle new items in overrides not in base list', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', amount: 2500, basedOnPresentDays: true },
        { masterId: '999', name: 'Special Allowance', amount: 1000, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(2);
      
      const specialItem = result.find(r => r.name === 'Special Allowance');
      expect(specialItem).toBeDefined();
      expect(specialItem.amount).toBe(1000);
      expect(specialItem.basedOnPresentDays).toBe(true);
      expect(specialItem.isEmployeeOverride).toBe(true);
    });

    test('should handle null or undefined overrides gracefully', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000 }
      ];

      const result1 = mergeWithOverrides(baseList, null, true);
      expect(result1).toHaveLength(1);

      const result2 = mergeWithOverrides(baseList, undefined, true);
      expect(result2).toHaveLength(1);
    });

    test('should filter out invalid overrides', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        null,
        { masterId: '1', amount: 2500, basedOnPresentDays: true },
        undefined
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(2500);
    });

    test('should not create duplicates', () => {
      const baseList = [
        { masterId: '1', name: 'Transport', amount: 3000, basedOnPresentDays: false }
      ];
      const overrides = [
        { masterId: '1', name: 'Transport', amount: 2500, basedOnPresentDays: true }
      ];
      const includeMissing = true;

      const result = mergeWithOverrides(baseList, overrides, includeMissing);

      expect(result).toHaveLength(1);
    });
  });
});
