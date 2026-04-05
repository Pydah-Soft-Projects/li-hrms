/**
 * Unit tests: late_in / early_out permission attendance adjustments (no DB).
 */

const {
  applyStatusFromDuration,
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
});
