/**
 * Unit tests for punch-based HOL/WO OD suggestion (no DB).
 */
const {
  getPunchBasedOdSuggestionForRecord,
  FULL_DAY_HOURS_THRESHOLD,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
} = require('../odHolidayApplyContextService');

describe('odHolidayApplyContextService.getPunchBasedOdSuggestionForRecord', () => {
  it('returns no punches when record is null', () => {
    const r = getPunchBasedOdSuggestionForRecord(null);
    expect(r.hasPunches).toBe(false);
    expect(r.suggestedOdTypeExtended).toBeNull();
    expect(r.punchContextDetail).toBe('no_attendance_daily');
  });

  it('returns no punches when hours below minimum', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: MIN_HOURS_FOR_PUNCH_CONTEXT - 0.1,
      shifts: [{ status: 'PRESENT', inTime: new Date() }],
    });
    expect(r.hasPunches).toBe(false);
    expect(r.punchContextDetail).toBe('insufficient_punches');
  });

  it('returns no punches when no worked segment', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 4,
      shifts: [{ status: 'ABSENT' }],
    });
    expect(r.hasPunches).toBe(false);
  });

  it('suggests half_day when any shift is HALF_DAY', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 8,
      shifts: [
        { status: 'PRESENT', inTime: new Date() },
        { status: 'HALF_DAY', inTime: new Date() },
      ],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('half_day');
    expect(r.punchContextDetail).toBe('shift_segment_half_day');
  });

  it('suggests full_day when hours >= threshold and no half segment', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: FULL_DAY_HOURS_THRESHOLD,
      shifts: [{ status: 'PRESENT', inTime: new Date(), outTime: new Date() }],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('full_day');
  });

  it('suggests half_day when hours between min and full threshold', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 3,
      shifts: [{ status: 'PRESENT', inTime: new Date() }],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('half_day');
    expect(r.punchContextDetail).toBe('hours_between_min_and_full_threshold');
  });
});
