const {
  evaluateHalfHolidaySandwichDay,
  partitionLeavesForHalfHoliday,
  applyHalfHolidayLeaveOverride,
  dayHasSpanOrFullLeave,
} = require('../halfHolidaySandwichPolicy');

function day(overrides = {}) {
  return {
    isHOL: false,
    rosterFirstHalfHOL: false,
    rosterSecondHalfHOL: true,
    leaves: [],
    ods: [],
    attendance: null,
    ...overrides,
  };
}

describe('halfHolidaySandwichPolicy', () => {
  it('both neighbours full leave, working half absent → strip and LOP', () => {
    const r = evaluateHalfHolidaySandwichDay(day(), 'LEAVE', 'LEAVE');
    expect(r.pushSandwichLop).toBe(true);
    expect(r.creditDelta).toBe(-0.5);
  });

  it('one neighbour leave only → keep holiday (no sandwich)', () => {
    const r = evaluateHalfHolidaySandwichDay(day(), 'LEAVE', 'PRESENT');
    expect(r.pushSandwichLop).toBe(false);
  });

  it('span/full leave on half-hol date → leave override, no half-hol sandwich', () => {
    const d = day({
      leaves: [{ isHalfDay: false, numberOfDays: 1, leaveType: 'CL' }],
    });
    expect(dayHasSpanOrFullLeave(d)).toBe(true);
    expect(applyHalfHolidayLeaveOverride(d)).toBe(true);
    expect(d.halfHolLeaveOverridesHoliday).toBe(true);
    expect(d.rosterSecondHalfHOL).toBe(false);
    const r = evaluateHalfHolidaySandwichDay(d, 'LEAVE', 'LEAVE');
    expect(r.pushSandwichLop).toBe(false);
  });

  it('leave on holiday half → keep holiday, no sandwich LOP', () => {
    const d = day({
      leaves: [{ isHalfDay: true, halfDayType: 'second_half', numberOfDays: 0.5, leaveType: 'CL' }],
    });
    const r = evaluateHalfHolidaySandwichDay(d, 'LEAVE', 'LEAVE');
    expect(r.pushSandwichLop).toBe(false);
    expect(r.ignoreLeavesOnHolidayHalf).toBe(true);
  });

  it('explicit leave on working half when sandwiched → keep holiday', () => {
    const d = day({
      leaves: [{ isHalfDay: true, halfDayType: 'first_half', numberOfDays: 0.5, leaveType: 'CL' }],
    });
    const r = evaluateHalfHolidaySandwichDay(d, 'LEAVE', 'LEAVE');
    expect(r.pushSandwichLop).toBe(false);
    const parts = partitionLeavesForHalfHoliday(d, 'second_half', 'first_half');
    expect(parts.onWorkingHalf).toHaveLength(1);
  });
});
