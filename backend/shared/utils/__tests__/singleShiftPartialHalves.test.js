'use strict';

const { getSingleShiftPartialPunchHalves } = require('../singleShiftPartialHalves');

describe('getSingleShiftPartialPunchHalves', () => {
  const t = (iso) => new Date(iso);

  test('non-PARTIAL → no halves', () => {
    expect(getSingleShiftPartialPunchHalves({ status: 'PRESENT', shifts: [] })).toEqual({
      attFirst: 0,
      attSecond: 0,
      workedHalf: null,
    });
    expect(getSingleShiftPartialPunchHalves(null)).toEqual({
      attFirst: 0,
      attSecond: 0,
      workedHalf: null,
    });
  });

  test('PARTIAL case-insensitive status', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'partial',
      shifts: [{ inTime: t('2026-05-01T09:00:00.000Z'), outTime: null }],
    });
    expect(r).toEqual({ attFirst: 0.5, attSecond: 0, workedHalf: 'first' });
  });

  test('IN-only via shifts[0].inTime (no out) → first half', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [{ inTime: t('2026-05-01T09:00:00.000Z'), outTime: null }],
    });
    expect(r).toEqual({ attFirst: 0.5, attSecond: 0, workedHalf: 'first' });
  });

  test('IN-only via root inTime → first half', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [],
      inTime: t('2026-05-01T09:00:00.000Z'),
    });
    expect(r).toEqual({ attFirst: 0.5, attSecond: 0, workedHalf: 'first' });
  });

  test('OUT-only via shifts (no in) → second half', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [{ inTime: null, outTime: t('2026-05-01T18:00:00.000Z') }],
    });
    expect(r).toEqual({ attFirst: 0, attSecond: 0.5, workedHalf: 'second' });
  });

  test('OUT-only via root outTime → second half', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [],
      outTime: t('2026-05-01T18:00:00.000Z'),
    });
    expect(r).toEqual({ attFirst: 0, attSecond: 0.5, workedHalf: 'second' });
  });

  test('IN across any shift + no OUT anywhere → first half', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [
        { inTime: null, outTime: null },
        { inTime: t('2026-05-01T09:00:00.000Z'), outTime: null },
      ],
    });
    expect(r.workedHalf).toBe('first');
    expect(r.attFirst).toBe(0.5);
    expect(r.attSecond).toBe(0);
  });

  test('both IN and OUT → no directional partial (0/0)', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [
        { inTime: t('2026-05-01T09:00:00.000Z'), outTime: t('2026-05-01T18:00:00.000Z') },
      ],
    });
    expect(r).toEqual({ attFirst: 0, attSecond: 0, workedHalf: null });
  });

  test('neither IN nor OUT → 0/0', () => {
    const r = getSingleShiftPartialPunchHalves({
      status: 'PARTIAL',
      shifts: [{ inTime: null, outTime: null }],
    });
    expect(r).toEqual({ attFirst: 0, attSecond: 0, workedHalf: null });
  });
});
