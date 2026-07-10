const {
  partialSingleShiftHalfCredits,
  computeRawAttendanceHalfCreditsSync,
  getWorkedHalfFromLegacyPenalties,
  getWorkedHalfFromShiftSegments,
  getWorkedHalfFromInThumbOnly,
  resolvePartialWorkedHalfKey,
  reconcilePartialDayStatus,
  resolveHalfDayWorkedHalfKey,
} = require('../attendanceHalfPresence');

describe('attendanceHalfPresence', () => {
  describe('partialSingleShiftHalfCredits', () => {
    it('credits first half when IN only', () => {
      const daily = {
        status: 'PARTIAL',
        shifts: [{ inTime: new Date('2026-04-01T09:00:00+05:30'), outTime: null }],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0.5, attSecond: 0 });
    });

    it('credits second half when OUT only (no IN)', () => {
      const daily = {
        status: 'PARTIAL',
        shifts: [{ inTime: null, outTime: new Date('2026-04-01T18:00:00+05:30') }],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0, attSecond: 0.5 });
    });

    it('IN+OUT meeting half-day threshold credits one half from IN thumb only (not both)', () => {
      const daily = {
        status: 'PARTIAL',
        payableShifts: 0.5,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-04-01T09:00:00+05:30'),
            outTime: new Date('2026-04-01T17:00:00+05:30'),
            punchHours: 4,
            expectedHours: 8,
            payableShift: 0.5,
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0.5, attSecond: 0 });
      expect(resolvePartialWorkedHalfKey(daily)).toBe('first_half');
    });

    it('IN+OUT afternoon IN credits second half when half-day threshold met', () => {
      const daily = {
        status: 'PARTIAL',
        payableShifts: 0.5,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-04-01T14:00:00+05:30'),
            outTime: new Date('2026-04-01T17:00:00+05:30'),
            punchHours: 4,
            expectedHours: 8,
            payableShift: 0.5,
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0, attSecond: 0.5 });
    });

    it('IN+OUT below half-day threshold is absent (no partial present credit)', () => {
      const daily = {
        status: 'PARTIAL',
        payableShifts: 0.1,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-04-01T09:00:00+05:30'),
            outTime: new Date('2026-04-01T10:00:00+05:30'),
            punchHours: 0.7,
            expectedHours: 8,
            payableShift: 0.1,
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0, attSecond: 0 });
      expect(reconcilePartialDayStatus(daily)).toBe('ABSENT');
    });

    it('IN+OUT without shift bounds falls back to first half when half-day threshold met', () => {
      const daily = {
        status: 'PARTIAL',
        date: '2026-04-01',
        payableShifts: 0.5,
        shifts: [
          {
            inTime: new Date('2026-04-01T09:00:00+05:30'),
            outTime: new Date('2026-04-01T13:00:00+05:30'),
            punchHours: 4,
            payableShift: 0.5,
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0.5, attSecond: 0 });
      expect(reconcilePartialDayStatus(daily)).toBeNull();
    });

    it('uses shift master firstHalf/secondHalf when populated on shiftId', () => {
      const daily = {
        status: 'PARTIAL',
        date: '2026-04-01',
        payableShifts: 0.5,
        shifts: [
          {
            inTime: new Date('2026-04-01T14:30:00+05:30'),
            outTime: new Date('2026-04-01T17:00:00+05:30'),
            punchHours: 4,
            expectedHours: 8,
            payableShift: 0.5,
            shiftId: {
              startTime: '09:00',
              endTime: '18:00',
              payableShifts: 1,
              firstHalf: { startTime: '09:00', endTime: '13:30', payableShifts: 0.5 },
              secondHalf: { startTime: '13:30', endTime: '18:00', payableShifts: 0.5 },
            },
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0, attSecond: 0.5 });
    });

    it('segment both-present on PARTIAL uses IN thumb when half-day met, not both halves', () => {
      const daily = {
        status: 'PARTIAL',
        payableShifts: 0.5,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-04-01T09:00:00+05:30'),
            outTime: new Date('2026-04-01T17:00:00+05:30'),
            punchHours: 4,
            expectedHours: 8,
            payableShift: 0.5,
            shiftSegments: [
              { segmentName: 'firstHalf', present: true },
              { segmentName: 'secondHalf', present: true },
            ],
          },
        ],
      };
      expect(getWorkedHalfFromShiftSegments(daily.shifts[0])).toBe('both');
      expect(getWorkedHalfFromInThumbOnly(daily.shifts[0])).toBe('first_half');
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0.5, attSecond: 0 });
    });

    it('uses shift segments when stored on shift row and half-day threshold met', () => {
      const daily = {
        status: 'PARTIAL',
        payableShifts: 0.5,
        shifts: [
          {
            inTime: new Date('2026-04-01T14:00:00+05:30'),
            outTime: new Date('2026-04-01T18:00:00+05:30'),
            punchHours: 4,
            expectedHours: 8,
            payableShift: 0.5,
            shiftSegments: [
              { segmentName: 'firstHalf', present: false },
              { segmentName: 'secondHalf', present: true },
            ],
          },
        ],
      };
      expect(partialSingleShiftHalfCredits(daily)).toEqual({ attFirst: 0, attSecond: 0.5 });
    });
  });

  describe('getWorkedHalfFromShiftSegments', () => {
    it('returns both when both segment halves are present', () => {
      expect(
        getWorkedHalfFromShiftSegments({
          shiftSegments: [
            { segmentName: 'firstHalf', present: true },
            { segmentName: 'secondHalf', present: true },
          ],
        })
      ).toBe('both');
    });
  });

  describe('getWorkedHalfFromLegacyPenalties', () => {
    it('uses punch-gap when penalties are tied', () => {
      const shift = {
        shiftStartTime: '09:00',
        shiftEndTime: '18:00',
        inTime: new Date('2026-04-01T14:00:00+05:30'),
        outTime: new Date('2026-04-01T18:00:00+05:30'),
      };
      const daily = { totalEarlyOutMinutes: 0, totalLateInMinutes: 0 };
      expect(getWorkedHalfFromLegacyPenalties(daily, shift)).toBe('second_half');
    });
  });

  describe('HALF_DAY single half only', () => {
    it('does not credit both halves when midpoint would return both', () => {
      const daily = {
        status: 'HALF_DAY',
        totalEarlyOutMinutes: 10,
        totalLateInMinutes: 60,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-03-30T09:00:00+05:30'),
            outTime: new Date('2026-03-30T17:00:00+05:30'),
            shiftSegments: [
              { segmentName: 'firstHalf', present: true },
              { segmentName: 'secondHalf', present: true },
            ],
          },
        ],
      };
      expect(resolveHalfDayWorkedHalfKey(daily)).toBe('second_half');
      expect(computeRawAttendanceHalfCreditsSync(daily, [], { processingMode: 'single_shift' })).toEqual({
        attFirst: 0,
        attSecond: 0.5,
      });
    });

    it('credits segment-present first half over small late-in (leave reconciliation)', () => {
      const daily = {
        status: 'HALF_DAY',
        totalEarlyOutMinutes: 0,
        totalLateInMinutes: 0,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-07-07T09:05:00+05:30'),
            outTime: new Date('2026-07-07T12:55:00+05:30'),
            lateInMinutes: 3,
            shiftSegments: [
              { segmentName: 'firstHalf', present: true },
              { segmentName: 'secondHalf', present: false },
            ],
          },
        ],
      };
      expect(resolveHalfDayWorkedHalfKey(daily)).toBe('first_half');
      expect(computeRawAttendanceHalfCreditsSync(daily, [], { processingMode: 'single_shift' })).toEqual({
        attFirst: 0.5,
        attSecond: 0,
      });
    });

    it('opposite-half leave would not clash: first_half leave + second_half worked', () => {
      const daily = {
        status: 'HALF_DAY',
        totalEarlyOutMinutes: 0,
        totalLateInMinutes: 30,
        shifts: [
          {
            shiftStartTime: '09:00',
            shiftEndTime: '18:00',
            inTime: new Date('2026-04-13T14:00:00+05:30'),
            outTime: new Date('2026-04-13T18:00:00+05:30'),
          },
        ],
      };
      const { attFirst, attSecond } = computeRawAttendanceHalfCreditsSync(daily, [], {
        processingMode: 'single_shift',
      });
      expect(attFirst).toBe(0);
      expect(attSecond).toBe(0.5);
    });
  });

  describe('computeRawAttendanceHalfCreditsSync PARTIAL', () => {
    it('applies partial halves only in single_shift mode', () => {
      const daily = {
        status: 'PARTIAL',
        shifts: [{ inTime: new Date('2026-04-01T09:00:00+05:30'), outTime: null }],
      };
      expect(computeRawAttendanceHalfCreditsSync(daily, [], { processingMode: 'single_shift' })).toEqual({
        attFirst: 0.5,
        attSecond: 0,
      });
      expect(computeRawAttendanceHalfCreditsSync(daily, [], { processingMode: 'multi_shift' })).toEqual({
        attFirst: 0,
        attSecond: 0,
      });
    });
  });
});
