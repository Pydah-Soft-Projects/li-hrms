const {
  buildEligibleEdges,
  deriveShiftDurationHours,
  findMatchingRange,
  getActualEdgeTime,
  applyAutoPermissionEdgeFields,
  getPermittedEdgeTime,
  getPermissionWindow,
  getSystemGateTime,
  getVerifiedStatus,
  toTimeString,
} = require('../services/autoEdgePermissionCreationService');

const istTime = (value) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(value);

describe('autoEdgePermissionCreationService helpers', () => {
  test('deriveShiftDurationHours prefers expectedHours', () => {
    expect(deriveShiftDurationHours({ expectedHours: 9, shiftStartTime: '09:00', shiftEndTime: '17:00' })).toBe(9);
  });

  test('deriveShiftDurationHours handles overnight shifts', () => {
    expect(deriveShiftDurationHours({ shiftStartTime: '21:00', shiftEndTime: '06:00' })).toBe(9);
  });

  test('findMatchingRange matches configured shift duration range', () => {
    const range = findMatchingRange(
      [
        { minShiftHours: 4, maxShiftHours: 6, allowedMinutes: 10 },
        { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 30 },
      ],
      9
    );
    expect(range.allowedMinutes).toBe(30);
  });

  test('toTimeString wraps around midnight', () => {
    expect(toTimeString(24 * 60 + 15)).toBe('00:15');
    expect(toTimeString(-30)).toBe('23:30');
  });

  test('getPermittedEdgeTime calculates late-in and early-out edge times', () => {
    const shift = { shiftStartTime: '09:00', shiftEndTime: '18:00' };
    expect(getPermittedEdgeTime(shift, 'late_in', 30)).toBe('09:30');
    expect(getPermittedEdgeTime(shift, 'early_out', 30)).toBe('17:30');
  });

  test('getActualEdgeTime uses actual segment in/out clock time', () => {
    const shift = {
      inTime: new Date('2026-05-06T09:07:00+05:30'),
      outTime: new Date('2026-05-06T17:52:00+05:30'),
    };
    expect(getActualEdgeTime(shift, 'late_in')).toBe('09:07');
    expect(getActualEdgeTime(shift, 'early_out')).toBe('17:52');
  });

  test('getPermissionWindow creates exact late-in and early-out segment windows', () => {
    const shift = {
      inTime: new Date('2026-05-06T09:07:00+05:30'),
      outTime: new Date('2026-05-06T17:52:00+05:30'),
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
    };

    const lateWindow = getPermissionWindow('2026-05-06', shift, 'late_in');
    const earlyWindow = getPermissionWindow('2026-05-06', shift, 'early_out');

    expect(istTime(lateWindow.startTime)).toBe('09:00');
    expect(istTime(lateWindow.endTime)).toBe('09:07');
    expect(istTime(earlyWindow.startTime)).toBe('17:52');
    expect(istTime(earlyWindow.endTime)).toBe('18:00');
  });

  test('applyAutoPermissionEdgeFields refreshes existing auto permission window', () => {
    const permission = {
      permittedEdgeTime: '12:30',
      permissionStartTime: new Date('2026-05-06T00:00:00+05:30'),
      permissionEndTime: new Date('2026-05-06T23:59:59+05:30'),
      permissionHours: 24,
      autoCreationMeta: {},
    };

    applyAutoPermissionEdgeFields(
      permission,
      { _id: 'daily1', date: '2026-05-06' },
      {
        permissionType: 'late_in',
        permittedEdgeTime: '09:07',
        detectedMinutes: 7,
        allowedMinutes: 30,
        shiftDurationHours: 9,
        matchedRange: { minShiftHours: 8, maxShiftHours: 10, description: 'full shift' },
        shift: {
          shiftNumber: 2,
          shiftName: 'General',
          inTime: new Date('2026-05-06T09:07:00+05:30'),
          shiftStartTime: '09:00',
          shiftEndTime: '18:00',
        },
      }
    );

    expect(permission.permittedEdgeTime).toBe('09:07');
    expect(istTime(permission.permissionStartTime)).toBe('09:00');
    expect(istTime(permission.permissionEndTime)).toBe('09:07');
    expect(permission.permissionHours).toBe(0.12);
    expect(permission.autoCreationMeta.shiftNumber).toBe(2);
  });

  test('getVerifiedStatus maps edge permission type to gate verified status', () => {
    expect(getVerifiedStatus('late_in')).toBe('checked_in');
    expect(getVerifiedStatus('early_out')).toBe('checked_out');
  });

  test('getSystemGateTime resolves punch time by edge type', () => {
    const inTime = new Date('2026-05-06T09:20:00+05:30');
    const outTime = new Date('2026-05-06T17:45:00+05:30');
    expect(getSystemGateTime({ permissionType: 'late_in', shift: { inTime, outTime } })).toEqual(inTime);
    expect(getSystemGateTime({ permissionType: 'early_out', shift: { inTime, outTime } })).toEqual(outTime);
  });

  test('buildEligibleEdges returns late-in and early-out edges within allowed minutes', () => {
    const settings = {
      isEnabled: true,
      applyFor: 'both',
      lateInRules: {
        shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 30 }],
      },
      earlyOutRules: {
        shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 20 }],
      },
    };
    const attendanceDaily = {
      shifts: [
        {
          shiftNumber: 1,
          inTime: new Date('2026-05-06T09:20:00+05:30'),
          outTime: new Date('2026-05-06T17:45:00+05:30'),
          shiftStartTime: '09:00',
          shiftEndTime: '18:00',
          expectedHours: 9,
          lateInMinutes: 20,
          earlyOutMinutes: 15,
        },
      ],
    };

    const edges = buildEligibleEdges(attendanceDaily, settings);
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.permissionType).sort()).toEqual(['early_out', 'late_in']);
    expect(edges.find((edge) => edge.permissionType === 'late_in').permittedEdgeTime).toBe('09:20');
    expect(edges.find((edge) => edge.permissionType === 'early_out').permittedEdgeTime).toBe('17:45');
  });

  test('buildEligibleEdges excludes edges below configured minimum minutes', () => {
    const settings = {
      isEnabled: true,
      applyFor: 'late_in',
      lateInRules: {
        shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 10, minimumMinutes: 2, allowedMinutes: 30 }],
      },
      earlyOutRules: { shiftDurationRanges: [] },
    };
    const attendanceDaily = {
      shifts: [
        {
          inTime: new Date('2026-05-06T09:00:53+05:30'),
          shiftStartTime: '09:00',
          shiftEndTime: '18:00',
          expectedHours: 9,
          lateInMinutes: 0.88,
        },
      ],
    };

    expect(buildEligibleEdges(attendanceDaily, settings)).toHaveLength(0);
  });

  test('buildEligibleEdges uses default 1 minute minimum when range omits it', () => {
    const settings = {
      isEnabled: true,
      applyFor: 'late_in',
      lateInRules: {
        shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 30 }],
      },
      earlyOutRules: { shiftDurationRanges: [] },
    };
    const attendanceDaily = {
      shifts: [
        {
          inTime: new Date('2026-05-06T09:00:53+05:30'),
          shiftStartTime: '09:00',
          shiftEndTime: '18:00',
          expectedHours: 9,
          lateInMinutes: 0.88,
        },
      ],
    };

    expect(buildEligibleEdges(attendanceDaily, settings)).toHaveLength(0);
  });

  test('buildEligibleEdges excludes edges above allowed minutes', () => {
    const settings = {
      isEnabled: true,
      applyFor: 'late_in',
      lateInRules: {
        shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 10 }],
      },
      earlyOutRules: { shiftDurationRanges: [] },
    };
    const attendanceDaily = {
      shifts: [
        {
          inTime: new Date('2026-05-06T09:20:00+05:30'),
          shiftStartTime: '09:00',
          shiftEndTime: '18:00',
          expectedHours: 9,
          lateInMinutes: 20,
        },
      ],
    };

    expect(buildEligibleEdges(attendanceDaily, settings)).toHaveLength(0);
  });
});
