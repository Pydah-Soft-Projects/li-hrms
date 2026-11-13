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

  test('completed 4 hours working with punches → HALF_DAY even if shift totalPayable was 0', () => {
    expect(
      resolveDailyStatusFromShiftTotals({
        hasPresentShift: false,
        totalPayableWithOD: 0,
        odPayableContribution: 0,
        hasPunches: true,
        totalWorkingHours: 4.12,
      })
    ).toBe('HALF_DAY');
  });

  test('completed 3h 56m working with 15m grace (3.93 >= 3.75) → HALF_DAY even if shift totalPayable was 0', () => {
    expect(
      resolveDailyStatusFromShiftTotals({
        hasPresentShift: false,
        totalPayableWithOD: 0,
        odPayableContribution: 0,
        hasPunches: true,
        totalWorkingHours: 3.93,
      })
    ).toBe('HALF_DAY');
  });
});
