/**
 * leaveRegisterService.addLeaveDebit / reverse: transaction shape and leaveType routing (no Mongo writes).
 */
jest.mock('../dateCycleService', () => ({
  getFinancialYearForDate: jest.fn().mockResolvedValue({ name: '2025-26' }),
}));
jest.mock('../leaveRegisterYearLedgerService', () => ({
  addTransaction: jest.fn().mockResolvedValue({ ok: true }),
  recalculateRegisterBalances: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../employees/model/Employee', () => ({
  findById: jest.fn(),
}));

const leaveRegisterService = require('../leaveRegisterService');
const leaveRegisterYearLedgerService = require('../leaveRegisterYearLedgerService');
const Employee = require('../../../employees/model/Employee');

function mockEmployee() {
  const doc = {
    _id: '507f1f77bcf86cd799439011',
    emp_no: 'E1',
    employee_name: 'Test',
    doj: new Date('2019-06-01T00:00:00.000Z'),
    is_active: true,
    department_id: { name: 'HQ' },
    designation_id: { name: 'Staff' },
    division_id: null,
  };
  Employee.findById.mockReturnValue({
    populate: jest.fn().mockReturnValue({
      populate: jest.fn().mockResolvedValue(doc),
    }),
  });
}

const baseLeave = (type, days = 1) => ({
  _id: '507f1f77bcf86cd799439012',
  employeeId: '507f1f77bcf86cd799439011',
  leaveType: type,
  status: 'approved',
  fromDate: new Date('2026-05-10T00:00:00.000Z'),
  toDate: new Date('2026-05-10T00:00:00.000Z'),
  numberOfDays: days,
  purpose: 'Test leave',
  createdAt: new Date('2026-05-01'),
  updatedAt: new Date('2026-05-02'),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEmployee();
});

describe('addLeaveDebit (simulation)', () => {
  it('posts a DEBIT with the request leaveType for CCL', async () => {
    const approver = '507f1f77bcf86cd799439099';
    await leaveRegisterService.addLeaveDebit(baseLeave('CCL', 2), approver);
    expect(leaveRegisterYearLedgerService.addTransaction).toHaveBeenCalledTimes(1);
    const arg = leaveRegisterYearLedgerService.addTransaction.mock.calls[0][0];
    expect(arg.transactionType).toBe('DEBIT');
    expect(arg.leaveType).toBe('CCL');
    expect(arg.days).toBe(2);
    expect(String(arg.approvedBy)).toBe(approver);
  });

  it('posts a DEBIT with EL when leaveType is EL', async () => {
    await leaveRegisterService.addLeaveDebit(baseLeave('EL', 0.5), null);
    const arg = leaveRegisterYearLedgerService.addTransaction.mock.calls[0][0];
    expect(arg.leaveType).toBe('EL');
    expect(arg.transactionType).toBe('DEBIT');
  });

  it('maps LOP to LOP leaveType', async () => {
    await leaveRegisterService.addLeaveDebit(
      { ...baseLeave('LOP', 1), leaveType: 'LOP' },
      'x'
    );
    const arg = leaveRegisterYearLedgerService.addTransaction.mock.calls[0][0];
    expect(arg.leaveType).toBe('LOP');
  });
});

describe('reverseLeaveDebit (simulation)', () => {
  it('posts reversing CREDIT from matching DEBIT rows by applicationId', async () => {
    const LeaveRegisterYear = require('../../model/LeaveRegisterYear');
    const spy = jest.spyOn(LeaveRegisterYear, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        months: [
          { transactions: [] },
          {
            transactions: [
              {
                applicationId: '507f1f77bcf86cd799439012',
                transactionType: 'DEBIT',
                leaveType: 'EL',
                startDate: new Date('2026-05-10'),
                endDate: new Date('2026-05-10'),
                days: 1,
              },
            ],
          },
        ],
      }),
    });
    const leave = {
      ...baseLeave('EL', 1),
      _id: '507f1f77bcf86cd799439012',
      status: 'cancelled',
    };
    await leaveRegisterService.reverseLeaveDebit(leave, 'canc1');
    expect(leaveRegisterYearLedgerService.addTransaction).toHaveBeenCalled();
    const call = leaveRegisterYearLedgerService.addTransaction.mock.calls.find(
      (c) => c[0].transactionType === 'CREDIT'
    );
    expect(call).toBeDefined();
    expect(call[0].leaveType).toBe('EL');
    expect(call[0].days).toBe(1);
    spy.mockRestore();
  });
});
