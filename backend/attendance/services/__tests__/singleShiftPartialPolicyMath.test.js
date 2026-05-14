'use strict';

/**
 * Mirrors calculateMonthlySummary partialLopPortion when usePartialPolicy is true:
 *   Math.round(Math.max(0, 1 - Math.min(1, mergedDailyCredit + dayPayable + leaveContrib)) * 100) / 100
 */
function partialLopPortion(mergedDailyCredit, dayPayable, leaveContrib, usePartialPolicy) {
  if (!usePartialPolicy) return 0;
  return (
    Math.round(
      Math.max(0, 1 - Math.min(1, mergedDailyCredit + dayPayable + leaveContrib)) * 100
    ) / 100
  );
}

describe('single-shift partial policy LOP math (aligned with summaryCalculationService)', () => {
  test('IN-only partial half (merged 0.5) + no payable boost + no leave → 0.5 LOP', () => {
    expect(partialLopPortion(0.5, 0, 0, true)).toBe(0.5);
  });

  test('merged 0.5 + dayPayable 0.5 (feature flag thumb) + no leave → 0 LOP', () => {
    expect(partialLopPortion(0.5, 0.5, 0, true)).toBe(0);
  });

  test('merged 0.5 + leave 0.5 (half-day approved) + no payable → full day covered, 0 LOP', () => {
    expect(partialLopPortion(0.5, 0, 0.5, true)).toBe(0);
  });

  test('merged 0 + dayPayable 0.5 + leave 0 → 0.5 LOP (edge: no att merge but payable only)', () => {
    expect(partialLopPortion(0, 0.5, 0, true)).toBe(0.5);
  });

  test('usePartialPolicy off (e.g. full-day OD) → no policy LOP from this formula', () => {
    expect(partialLopPortion(0, 0, 0, false)).toBe(0);
    expect(partialLopPortion(1, 0, 0, false)).toBe(0);
  });

  test('full merged 1.0 → 0 LOP', () => {
    expect(partialLopPortion(1, 0, 0, true)).toBe(0);
  });
});
