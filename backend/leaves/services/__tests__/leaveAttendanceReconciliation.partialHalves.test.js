/**
 * Half-credit rules for PARTIAL + single-shift (must match monthly summary).
 * Heavy deps mocked so Jest does not load DB/Redis.
 */
'use strict';

jest.mock('../../../settings/model/Settings', () => ({}));
jest.mock('../../../leaves/model/Leave', () => ({}));
jest.mock('../../../leaves/model/OD', () => ({}));
jest.mock('../../../leaves/services/leaveRegisterService', () => ({}));
jest.mock('../../../leaves/services/leaveRegisterYearMonthlyApplyService', () => ({}));
jest.mock('../../../shared/services/payrollRequestLockService', () => ({
  assertEmployeeDateRequestsEditable: jest.fn(),
}));
jest.mock('../../../overtime/services/esiLeaveOtService', () => ({
  isEsiLeaveType: jest.fn(() => false),
}));
jest.mock('../../../pay-register/services/autoSyncService', () => ({
  syncPayRegisterFromLeave: jest.fn(),
  syncPayRegisterFromOD: jest.fn(),
}));

const {
  computeRawAttendanceHalfCredits,
} = require('../leaveAttendanceReconciliationService');

describe('computeRawAttendanceHalfCredits (PARTIAL + single-shift)', () => {
  const t = (iso) => new Date(iso);

  test('PARTIAL IN-only + singleShiftMode → first half credit', () => {
    const daily = {
      status: 'PARTIAL',
      shifts: [{ inTime: t('2026-05-10T09:00:00.000Z'), outTime: null }],
    };
    expect(computeRawAttendanceHalfCredits(daily, [], { singleShiftMode: true })).toEqual({
      attFirst: 0.5,
      attSecond: 0,
    });
  });

  test('PARTIAL OUT-only + singleShiftMode → second half credit', () => {
    const daily = {
      status: 'PARTIAL',
      shifts: [{ inTime: null, outTime: t('2026-05-10T18:00:00.000Z') }],
    };
    expect(computeRawAttendanceHalfCredits(daily, [], { singleShiftMode: true })).toEqual({
      attFirst: 0,
      attSecond: 0.5,
    });
  });

  test('PARTIAL IN-only + singleShiftMode false → no credit (multi-shift safe)', () => {
    const daily = {
      status: 'PARTIAL',
      shifts: [{ inTime: t('2026-05-10T09:00:00.000Z'), outTime: null }],
    };
    expect(computeRawAttendanceHalfCredits(daily, [], { singleShiftMode: false })).toEqual({
      attFirst: 0,
      attSecond: 0,
    });
  });

  test('PARTIAL IN-only + opts omitted → no credit', () => {
    const daily = {
      status: 'PARTIAL',
      shifts: [{ inTime: t('2026-05-10T09:00:00.000Z'), outTime: null }],
    };
    expect(computeRawAttendanceHalfCredits(daily, [])).toEqual({
      attFirst: 0,
      attSecond: 0,
    });
  });

  test('PRESENT unchanged regardless of singleShiftMode', () => {
    const daily = { status: 'PRESENT', shifts: [] };
    expect(computeRawAttendanceHalfCredits(daily, [], { singleShiftMode: false })).toEqual({
      attFirst: 0.5,
      attSecond: 0.5,
    });
  });

  test('HALF_DAY uses late/early minutes', () => {
    const daily = {
      status: 'HALF_DAY',
      totalEarlyOutMinutes: 30,
      totalLateInMinutes: 0,
      shifts: [],
    };
    expect(computeRawAttendanceHalfCredits(daily, [])).toEqual({
      attFirst: 0.5,
      attSecond: 0,
    });
  });
});
