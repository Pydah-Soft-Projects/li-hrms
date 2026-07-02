const {
  applyRosterNonWorkingLeaveResolution,
  buildContributingNonWorkingEntries,
  combineApprovedLeaveHalfCredits,
} = require('../rosterNonWorkingLeaveResolution');

function day(overrides = {}) {
  return {
    isWO: false,
    isHOL: false,
    rosterFirstHalfHOL: false,
    rosterSecondHalfHOL: false,
    rosterFirstHalfWO: false,
    rosterSecondHalfWO: false,
    leaves: [],
    ...overrides,
  };
}

describe('rosterNonWorkingLeaveResolution', () => {
  it('full leave on full holiday → no HOL credit, leave override flag', () => {
    const d = day({
      isHOL: true,
      leaves: [{ isHalfDay: false, numberOfDays: 1, leaveType: 'LOP', leaveNature: 'lop' }],
    });
    const r = applyRosterNonWorkingLeaveResolution(d);
    expect(r.holCredit).toBe(0);
    expect(d.isHOL).toBe(false);
    expect(d.rosterFirstHalfHOL).toBe(false);
    expect(d.rosterSecondHalfHOL).toBe(false);
    expect(d.halfHolLeaveOverridesHoliday).toBe(true);
    expect(d.nonWorkingLeaveResolved.leaveFullyOverridesNonWorking).toBe(true);
  });

  it('half leave on full holiday → 0.5 HOL on other half', () => {
    const d = day({
      isHOL: true,
      leaves: [{ isHalfDay: true, halfDayType: 'first_half', numberOfDays: 0.5, leaveType: 'CL' }],
    });
    applyRosterNonWorkingLeaveResolution(d);
    expect(d.isHOL).toBe(false);
    expect(d.rosterFirstHalfHOL).toBe(false);
    expect(d.rosterSecondHalfHOL).toBe(true);
    expect(d.nonWorkingLeaveResolved.holCredit).toBe(0.5);
    expect(d.nonWorkingLeaveResolved.leavePartiallyOverridesNonWorking).toBe(true);
  });

  it('half leave on same half as half holiday → leave only, no HOL', () => {
    const d = day({
      rosterSecondHalfHOL: true,
      leaves: [{ isHalfDay: true, halfDayType: 'second_half', numberOfDays: 0.5, leaveType: 'CL' }],
    });
    applyRosterNonWorkingLeaveResolution(d);
    expect(d.rosterSecondHalfHOL).toBe(false);
    expect(d.nonWorkingLeaveResolved.holCredit).toBe(0);
  });

  it('half leave on full week-off → 0.5 WO remaining', () => {
    const d = day({
      isWO: true,
      leaves: [{ isHalfDay: true, halfDayType: 'second_half', numberOfDays: 0.5, leaveType: 'CL' }],
    });
    applyRosterNonWorkingLeaveResolution(d);
    expect(d.isWO).toBe(false);
    expect(d.rosterFirstHalfWO).toBe(true);
    expect(d.rosterSecondHalfWO).toBe(false);
    expect(d.nonWorkingLeaveResolved.woCredit).toBe(0.5);
  });

  it('contributing holidays excludes leave-overridden full HOL', () => {
    const dStr = '2026-05-28';
    const d = day({
      isHOL: true,
      leaves: [{ isHalfDay: false, numberOfDays: 1, leaveType: 'LOP' }],
    });
    applyRosterNonWorkingLeaveResolution(d);
    const map = new Map([[dStr, d]]);
    const { holidays } = buildContributingNonWorkingEntries([dStr], map, () => false);
    expect(holidays).toHaveLength(0);
  });

  it('combineApprovedLeaveHalfCredits respects second half', () => {
    const m = combineApprovedLeaveHalfCredits([
      { isHalfDay: true, halfDayType: 'second_half', numberOfDays: 0.5 },
    ]);
    expect(m.first).toBe(0);
    expect(m.second).toBe(0.5);
  });
});
