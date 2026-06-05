const {
  netUsedDaysForType,
  scheduleRegisterReconciliationFromDate,
} = require('../monthlyTransferReconciliationService');

describe('monthlyTransferReconciliation CCL', () => {
  test('netUsedDaysForType(CCL) counts debits only (no reversal subtract)', () => {
    const slot = {
      transactions: [
        { leaveType: 'CCL', transactionType: 'DEBIT', days: 4 },
        {
          leaveType: 'CCL',
          transactionType: 'CREDIT',
          days: 1,
          reason: 'Leave Application Cancelled/Reversed',
        },
      ],
    };
    expect(netUsedDaysForType(slot, 'CCL')).toBe(4);
  });

  test('netUsedDaysForType(CL) still subtracts reversal credits', () => {
    const slot = {
      transactions: [
        { leaveType: 'CL', transactionType: 'DEBIT', days: 4 },
        {
          leaveType: 'CL',
          transactionType: 'CREDIT',
          days: 1,
          reason: 'Leave Application Cancelled/Reversed',
        },
      ],
    };
    expect(netUsedDaysForType(slot, 'CL')).toBe(3);
  });

  test('scheduleRegisterReconciliationFromDate is exported', () => {
    expect(typeof scheduleRegisterReconciliationFromDate).toBe('function');
  });
});
