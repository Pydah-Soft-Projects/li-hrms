const {
  resolveDailyStatusFromShiftTotals,
} = require('../../attendance/utils/dailyStatusFromShifts');

describe('resolveDailyStatusFromShiftTotals', () => {
  test('two HALF_DAY segment rows (0.5 + 0.5 payable) → PRESENT', () => {
    expect(
      resolveDailyStatusFromShiftTotals({
        hasPresentShift: false,
        totalPayableWithOD: 1,
        odPayableContribution: 0,
        hasPunches: true,
      })
    ).toBe('PRESENT');
  });

  test('single PRESENT shift row → PRESENT', () => {
    expect(
      resolveDailyStatusFromShiftTotals({
        hasPresentShift: true,
        totalPayableWithOD: 1,
        odPayableContribution: 0,
        hasPunches: true,
      })
    ).toBe('PRESENT');
  });

  test('one half-day payable → HALF_DAY', () => {
    expect(
      resolveDailyStatusFromShiftTotals({
        hasPresentShift: false,
        totalPayableWithOD: 0.5,
        odPayableContribution: 0,
        hasPunches: true,
      })
    ).toBe('HALF_DAY');
  });
});
