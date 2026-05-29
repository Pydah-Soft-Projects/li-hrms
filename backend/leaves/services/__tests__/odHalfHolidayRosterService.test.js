const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isFullDayOdRequest,
  isHalfDayOdRequest,
  resolveOdApplyAgainstHalfHoliday,
  resolveLeaveApplyAgainstHalfHoliday,
} = require('../odHalfHolidayRosterService');

describe('odHalfHolidayRosterService', () => {
  it('isFullDayOdRequest detects full day', () => {
    assert.equal(
      isFullDayOdRequest({ isHalfDay: false, odType_extended: 'full_day', numberOfDays: 1 }),
      true
    );
    assert.equal(
      isHalfDayOdRequest({ isHalfDay: true, halfDayType: 'first_half', numberOfDays: 0.5 }),
      true
    );
  });

  it('resolveOdApplyAgainstHalfHoliday rejects half OD on holiday half', async () => {
    const PreScheduledShift = require('../../../shifts/model/PreScheduledShift');
    const orig = PreScheduledShift.findOne;
    PreScheduledShift.findOne = () => ({
      select: () => ({
        lean: async () => ({
          shiftId: 's1',
          firstHalfStatus: null,
          secondHalfStatus: 'HOL',
        }),
      }),
    });
    try {
      const r = await resolveOdApplyAgainstHalfHoliday('EMP1', '2026-06-01', {
        isHalfDay: true,
        halfDayType: 'second_half',
        odType_extended: 'half_day',
        numberOfDays: 0.5,
      });
      assert.equal(r.ok, false);
      assert.match(r.error, /holiday/i);
    } finally {
      PreScheduledShift.findOne = orig;
    }
  });

  it('resolveLeaveApplyAgainstHalfHoliday narrows full-day leave', async () => {
    const PreScheduledShift = require('../../../shifts/model/PreScheduledShift');
    const orig = PreScheduledShift.findOne;
    PreScheduledShift.findOne = () => ({
      select: () => ({
        lean: async () => ({
          shiftId: 's1',
          firstHalfStatus: null,
          secondHalfStatus: 'HOL',
        }),
      }),
    });
    try {
      const r = await resolveLeaveApplyAgainstHalfHoliday('EMP1', '2026-06-01', {
        isHalfDay: false,
        numberOfDays: 1,
      });
      assert.equal(r.ok, true);
      assert.equal(r.narrowed, true);
      assert.equal(r.halfDayType, 'first_half');
      assert.equal(r.numberOfDays, 0.5);
    } finally {
      PreScheduledShift.findOne = orig;
    }
  });

  it('resolveOdApplyAgainstHalfHoliday narrows full-day OD', async () => {
    const PreScheduledShift = require('../../../shifts/model/PreScheduledShift');
    const orig = PreScheduledShift.findOne;
    PreScheduledShift.findOne = () => ({
      select: () => ({
        lean: async () => ({
          shiftId: 's1',
          firstHalfStatus: 'HOL',
          secondHalfStatus: null,
        }),
      }),
    });
    try {
      const r = await resolveOdApplyAgainstHalfHoliday('EMP1', '2026-06-01', {
        isHalfDay: false,
        odType_extended: 'full_day',
        numberOfDays: 1,
      });
      assert.equal(r.ok, true);
      assert.equal(r.narrowed, true);
      assert.equal(r.halfDayType, 'second_half');
      assert.equal(r.numberOfDays, 0.5);
    } finally {
      PreScheduledShift.findOne = orig;
    }
  });
});
