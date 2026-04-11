const { accumulateAttendanceRangeEl } = require('../earnedLeaveRangeAccumulation');

describe('accumulateAttendanceRangeEl (cumulative thresholds)', () => {
  const devLikeRanges = [
    { minDays: 0, maxDays: 10, elEarned: 0, description: '' },
    { minDays: 11, maxDays: 20, elEarned: 2, description: '' },
    { minDays: 21, maxDays: 31, elEarned: 2, description: '' },
  ];

  it('stacks bands when credit days cross each min threshold', () => {
    expect(accumulateAttendanceRangeEl(devLikeRanges, 16.5, 4).elEarned).toBe(2); // 0 + 2
    expect(accumulateAttendanceRangeEl(devLikeRanges, 21, 10).elEarned).toBe(4); // 0 + 2 + 2
    expect(accumulateAttendanceRangeEl(devLikeRanges, 24.5, 10).elEarned).toBe(4);
  });

  it('respects maxELPerMonth cap', () => {
    expect(accumulateAttendanceRangeEl(devLikeRanges, 24.5, 3).elEarned).toBe(3);
  });

  it('matches UI doc example bands at 25 and 27 credit days', () => {
    const uiExample = [
      { minDays: 1, maxDays: 10, elEarned: 0 },
      { minDays: 11, maxDays: 20, elEarned: 1 },
      { minDays: 21, maxDays: 25, elEarned: 1 },
      { minDays: 26, maxDays: 31, elEarned: 2 },
    ];
    expect(accumulateAttendanceRangeEl(uiExample, 25, 10).elEarned).toBe(2); // 0+1+1
    expect(accumulateAttendanceRangeEl(uiExample, 27, 10).elEarned).toBe(4); // 0+1+1+2
  });
});
