/**
 * Policy / tier resolution used by annual CL reset and parallel EL/CCL/other-type blocks.
 */
const {
  getMatchingExperienceTier,
  getMaxAnnualCarryForwardCl,
  getCasualLeaveEntitlement,
} = require('../annualCLResetService');

const baseSettings = (overrides = {}) => ({
  annualCLReset: {
    enabled: true,
    addCarryForward: true,
    maxCarryForwardCl: 10,
    resetToBalance: 12,
    casualLeaveByExperience: [
      { minYears: 0, maxYears: 2, casualLeave: 12, monthly: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { minYears: 2, maxYears: 20, casualLeave: 15, monthly: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    ],
  },
  ...overrides,
});

describe('annualCLResetService policy math (simulation)', () => {
  it('getMaxAnnualCarryForwardCl uses explicit cap when set', () => {
    expect(getMaxAnnualCarryForwardCl(baseSettings())).toBe(10);
  });

  it('getMaxAnnualCarryForwardCl defaults to 12 when unset', () => {
    const s = { annualCLReset: { resetToBalance: 12 } };
    expect(getMaxAnnualCarryForwardCl(s)).toBe(12);
  });

  it('getMatchingExperienceTier picks tier by years of service at reset date', () => {
    const doj = new Date('2024-01-01T00:00:00.000Z');
    const reset = new Date('2025-06-15T00:00:00.000Z');
    const { tier, defaultCL } = getMatchingExperienceTier(baseSettings(), doj, reset);
    expect(tier).toBeTruthy();
    expect(tier.minYears).toBe(0);
    expect(tier.maxYears).toBe(2);
    expect(defaultCL).toBe(12);
  });

  it('getCasualLeaveEntitlement returns sum of monthly grid for matched tier', () => {
    const s = baseSettings();
    const doj = new Date('2020-01-01T00:00:00.000Z');
    const reset = new Date('2026-04-01T00:00:00.000Z');
    const ent = getCasualLeaveEntitlement(s, doj, reset);
    expect(ent).toBeGreaterThanOrEqual(10);
  });
});
