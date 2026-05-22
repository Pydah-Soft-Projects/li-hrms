/**
 * EL balance for payroll prefers leave-register ledger over stale Employee.paidLeaves.
 */

jest.mock('../../../leaves/model/LeaveRegisterYear', () => ({
  exists: jest.fn(),
}));

jest.mock('../../../leaves/services/leaveRegisterYearLedgerService', () => ({
  getCurrentBalanceLedgerOnly: jest.fn(),
}));

const LeaveRegisterYear = require('../../../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../../../leaves/services/leaveRegisterYearLedgerService');
const { getElBalanceForPayroll, getPolicyFallbackElUsedRaw } = require('../elUsedInPayrollHelper');

jest.mock('../../../leaves/services/earnedLeavePolicyResolver', () => ({
  resolveEffectiveEarnedLeaveForDepartment: jest.fn().mockResolvedValue({
    enabled: true,
    useAsPaidInPayroll: true,
  }),
}));

describe('elUsedInPayrollHelper balance', () => {
  const employeeId = '507f1f77bcf86cd799439011';
  const employee = { _id: employeeId, paidLeaves: 4 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses ledger 0 when register exists even if paidLeaves is 4', async () => {
    LeaveRegisterYear.exists.mockResolvedValue({ _id: 'yr' });
    leaveRegisterYearLedgerService.getCurrentBalanceLedgerOnly.mockResolvedValue(0);

    const balance = await getElBalanceForPayroll(employeeId, employee);
    expect(balance).toBe(0);
  });

  test('policy fallback returns 0 when ledger is 0 (stale profile ignored)', async () => {
    LeaveRegisterYear.exists.mockResolvedValue({ _id: 'yr' });
    leaveRegisterYearLedgerService.getCurrentBalanceLedgerOnly.mockResolvedValue(0);

    const raw = await getPolicyFallbackElUsedRaw(employee, 'dept', 'motion', 30);
    expect(raw).toBe(0);
  });

  test('falls back to paidLeaves when no leave register year doc', async () => {
    LeaveRegisterYear.exists.mockResolvedValue(null);
    const balance = await getElBalanceForPayroll(employeeId, employee);
    expect(balance).toBe(4);
  });
});
