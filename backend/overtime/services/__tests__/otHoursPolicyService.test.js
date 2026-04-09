const { applyOtHoursPolicy, snapToNearestMinuteGrid } = require('../otHoursPolicyService');

describe('applyOtHoursPolicy', () => {
  const base = {
    recognitionMode: 'none',
    thresholdHours: null,
    minOTHours: 0,
    roundUpIfFractionMinutesGte: null,
  };

  it('passes through raw hours when no rules', () => {
    const r = applyOtHoursPolicy(1.25, base);
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(1.25);
  });

  it('threshold_full: below threshold → 0', () => {
    const r = applyOtHoursPolicy(0.5, {
      ...base,
      recognitionMode: 'threshold_full',
      thresholdHours: 1,
    });
    expect(r.eligible).toBe(false);
    expect(r.finalHours).toBe(0);
  });

  it('threshold_full: at/above threshold keeps full raw', () => {
    const r = applyOtHoursPolicy(1.5, {
      ...base,
      recognitionMode: 'threshold_full',
      thresholdHours: 1,
    });
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(1.5);
  });

  it('minOTHours rejects smaller raw', () => {
    const r = applyOtHoursPolicy(0.5, { ...base, minOTHours: 1 });
    expect(r.eligible).toBe(false);
    expect(r.finalHours).toBe(0);
  });

  it('roundUpIfFractionMinutesGte: 1h45m → 2h', () => {
    const r = applyOtHoursPolicy(1.75, {
      ...base,
      roundUpIfFractionMinutesGte: 45,
    });
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(2);
  });

  it('roundUpIfFractionMinutesGte: 1h30m → 1h', () => {
    const r = applyOtHoursPolicy(1.5, {
      ...base,
      roundUpIfFractionMinutesGte: 45,
    });
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(1);
  });

  it('roundingMinutes: snaps to nearest quarter-hour before whole-hour rule', () => {
    const r = applyOtHoursPolicy(1.37, {
      ...base,
      roundingMinutes: 15,
      roundUpIfFractionMinutesGte: null,
    });
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(1.25);
    expect(r.steps.some((s) => s.includes('snap_nearest_15min'))).toBe(true);
  });

  it('snapToNearestMinuteGrid: 1.37h → 1.25h at 15 min', () => {
    expect(snapToNearestMinuteGrid(1.37, 15)).toBeCloseTo(1.25, 4);
  });

  it('range mapping: 30-60 -> 60 minutes', () => {
    const r = applyOtHoursPolicy(0.7, {
      ...base,
      otHourRanges: [{ minMinutes: 30, maxMinutes: 60, creditedMinutes: 60 }],
    });
    expect(r.eligible).toBe(true);
    expect(r.finalHours).toBe(1);
  });

  it('range mapping: no match -> zero', () => {
    const r = applyOtHoursPolicy(0.2, {
      ...base,
      otHourRanges: [{ minMinutes: 30, maxMinutes: 60, creditedMinutes: 60 }],
    });
    expect(r.eligible).toBe(false);
    expect(r.finalHours).toBe(0);
  });
});
