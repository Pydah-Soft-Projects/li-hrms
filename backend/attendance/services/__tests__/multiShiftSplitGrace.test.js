/**
 * Simulates grace behaviour used by multi-shift iterative SPLIT path
 * (must match calculateLateIn / calculateEarlyOut — not raw ms diff).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLateIn,
  calculateEarlyOut,
} = require('../../../shifts/services/shiftDetectionService');

const DATE = '2026-06-05';
const punch = (hhmm) => new Date(`${DATE}T${hhmm}:00+05:30`);

/** Mirrors split-loop rules: late-in only on first segment; early-out waived on HALF_DAY */
function computeSplitSegmentGrace({
  splitIdx,
  inTime,
  outTime,
  shiftStartTime,
  shiftEndTime,
  shiftGrace = 15,
  globalLateGrace = 20,
  globalEarlyGrace = 10,
  status = 'PRESENT',
}) {
  let lateInMinutes = 0;
  if (splitIdx === 0 && inTime && shiftStartTime) {
    lateInMinutes =
      calculateLateIn(inTime, shiftStartTime, shiftGrace, DATE, globalLateGrace) || 0;
  }
  let earlyOutMinutes = 0;
  if (status !== 'HALF_DAY' && outTime && shiftEndTime && shiftStartTime) {
    const early = calculateEarlyOut(
      outTime,
      shiftEndTime,
      shiftStartTime,
      DATE,
      globalEarlyGrace,
      shiftGrace
    );
    earlyOutMinutes = early != null && early > 0 ? early : 0;
  }
  return {
    isLateIn: lateInMinutes > 0,
    lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
    isEarlyOut: earlyOutMinutes > 0,
    earlyOutMinutes: earlyOutMinutes > 0 ? earlyOutMinutes : null,
  };
}

/** Old buggy split logic (raw ms vs shift boundary dates, no grace) */
function computeSplitSegmentGraceLegacy({ inTime, outTime, shiftStartDate, shiftEndDate }) {
  const lateInMs = inTime < shiftStartDate ? 0 : inTime.getTime() - shiftStartDate.getTime();
  const earlyOutMs =
    outTime && outTime < shiftEndDate ? shiftEndDate.getTime() - outTime.getTime() : 0;
  return {
    isLateIn: lateInMs > 0,
    lateInMinutes: Math.round(lateInMs / 60000),
    isEarlyOut: earlyOutMs > 0,
    earlyOutMinutes: Math.round(earlyOutMs / 60000),
  };
}

describe('multi-shift split grace simulation', () => {
  it('first segment: 12 min late with 20 min global grace → not late (old logic wrongly flagged)', () => {
    const shiftStartDate = punch('09:00');
    const shiftEndDate = punch('18:00');
    const inTime = punch('09:12');
    const outTime = punch('18:00');

    const fixed = computeSplitSegmentGrace({
      splitIdx: 0,
      inTime,
      outTime,
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      globalLateGrace: 20,
    });
    const legacy = computeSplitSegmentGraceLegacy({
      inTime,
      outTime,
      shiftStartDate,
      shiftEndDate,
    });

    assert.equal(fixed.isLateIn, false);
    assert.equal(fixed.lateInMinutes, null);
    assert.equal(legacy.isLateIn, true);
    assert.equal(legacy.lateInMinutes, 12);
  });

  it('first segment: 25 min late with 20 min global grace → 5 min late', () => {
    const inTime = punch('09:25');
    const outTime = punch('18:00');

    const fixed = computeSplitSegmentGrace({
      splitIdx: 0,
      inTime,
      outTime,
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      globalLateGrace: 20,
    });

    assert.equal(fixed.isLateIn, true);
    assert.equal(fixed.lateInMinutes, 5);
  });

  it('second split segment: synthetic IN at boundary → no late-in', () => {
    const inTime = punch('18:00'); // boundary start, not thumb IN
    const outTime = punch('23:00');

    const fixed = computeSplitSegmentGrace({
      splitIdx: 1,
      inTime,
      outTime,
      shiftStartTime: '18:00',
      shiftEndTime: '23:00',
      globalLateGrace: 15,
    });

    assert.equal(fixed.isLateIn, false);
    assert.equal(fixed.lateInMinutes, null);
  });

  it('early-out within 10 min global grace → not early (old logic wrongly flagged 8 min)', () => {
    const shiftStartDate = punch('09:00');
    const shiftEndDate = punch('18:00');
    const inTime = punch('09:00');
    const outTime = punch('17:52'); // 8 min early

    const fixed = computeSplitSegmentGrace({
      splitIdx: 0,
      inTime,
      outTime,
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      globalEarlyGrace: 10,
    });
    const legacy = computeSplitSegmentGraceLegacy({
      inTime,
      outTime,
      shiftStartDate,
      shiftEndDate,
    });

    assert.equal(fixed.isEarlyOut, false);
    assert.equal(legacy.isEarlyOut, true);
    assert.equal(legacy.earlyOutMinutes, 8);
  });

  it('HALF_DAY segment waives early-out penalty', () => {
    const inTime = punch('09:00');
    const outTime = punch('17:00');

    const fixed = computeSplitSegmentGrace({
      splitIdx: 0,
      inTime,
      outTime,
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      status: 'HALF_DAY',
      globalEarlyGrace: 10,
    });

    assert.equal(fixed.isEarlyOut, false);
    assert.equal(fixed.earlyOutMinutes, null);
  });
});
