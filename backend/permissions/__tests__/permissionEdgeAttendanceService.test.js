/**
 * Unit tests: late_in / early_out permission attendance adjustments (no DB).
 */

const {
  applyEdgePermissionAdjustmentsToShiftSegment,
  applyStatusFromDuration,
  resolveDailyStatusFromShifts,
  timeOnDate,
  shiftOvernight,
  resolvePermittedInstant,
} = require('../services/permissionEdgeAttendanceService');
const { extractISTComponents } = require('../../shared/utils/dateUtils');

describe('permissionEdgeAttendanceService helpers', () => {
  test('timeOnDate builds IST instant on calendar date', () => {
    const d = timeOnDate('10:30', '2026-04-05', false);
    expect(d).toBeInstanceOf(Date);
    const s = d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    expect(s).toMatch(/10:30/);
  });

  test('shiftOvernight detects end before start', () => {
    expect(shiftOvernight('21:00', '06:00')).toBe(true);
    expect(shiftOvernight('09:00', '18:00')).toBe(false);
  });

  test('resolvePermittedInstant: overnight morning time uses shift-end calendar day', () => {
    const d = resolvePermittedInstant('05:30', '2026-04-05', '21:00', true);
    expect(extractISTComponents(d).dateStr).toBe('2026-04-06');
  });

  test('resolvePermittedInstant: overnight evening time stays on attendance date', () => {
    const d = resolvePermittedInstant('22:15', '2026-04-05', '21:00', true);
    expect(extractISTComponents(d).dateStr).toBe('2026-04-05');
  });

  test('resolvePermittedInstant: day shift always on attendance date', () => {
    const d = resolvePermittedInstant('17:00', '2026-04-05', '09:00', false);
    expect(extractISTComponents(d).dateStr).toBe('2026-04-05');
  });

  test('applyStatusFromDuration uses punch + od + edge hours', () => {
    const p = {
      punchHours: 6,
      odHours: 0,
      edgePermissionHours: 2,
      basePayable: 1,
    };
    applyStatusFromDuration(p, 8);
    expect(p.status).toBe('PRESENT');
    expect(p.payableShift).toBe(1);

    const p2 = { punchHours: 2, odHours: 0, edgePermissionHours: 2, basePayable: 1 };
    applyStatusFromDuration(p2, 8);
    expect(p2.status).toBe('HALF_DAY');
  });

  test('resolveDailyStatusFromShifts handles multi-shift payable totals', () => {
    expect(resolveDailyStatusFromShifts([
      { status: 'HALF_DAY', payableShift: 0.5, outTime: new Date() },
      { status: 'HALF_DAY', payableShift: 0.5, outTime: new Date() },
    ])).toBe('PRESENT');

    expect(resolveDailyStatusFromShifts([
      { status: 'ABSENT', payableShift: 0, outTime: null },
    ])).toBe('PARTIAL');
  });

  test('applyEdgePermissionAdjustmentsToShiftSegment resets edgePermissionHours to 0 when outTime is missing', async () => {
    const pShift = {
      shiftStartTime: '09:00',
      shiftEndTime: '21:00',
      inTime: new Date('2026-09-05T10:00:00+05:30'),
      outTime: null,
      punchHours: 0,
      odHours: 0,
      edgePermissionHours: 0.75,
      workingHours: 0.75,
    };
    await applyEdgePermissionAdjustmentsToShiftSegment({
      employeeNumber: '1139',
      date: '2026-09-05',
      pShift,
    });
    expect(pShift.edgePermissionHours).toBe(0);
    expect(pShift.workingHours).toBe(0);
  });
});
