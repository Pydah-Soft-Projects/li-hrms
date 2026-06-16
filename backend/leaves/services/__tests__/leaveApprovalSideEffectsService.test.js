jest.mock('../../../attendance/services/summaryCalculationService', () => ({
  recalculateOnLeaveApproval: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../pay-register/services/autoSyncService', () => ({
  syncPayRegisterFromLeave: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../overtime/services/esiLeaveOtService', () => ({
  isEsiLeaveType: jest.fn((t) => String(t).toUpperCase() === 'ESI'),
  syncEsiLeaveOtForLeave: jest.fn().mockResolvedValue(undefined),
}));

const summaryCalculationService = require('../../../attendance/services/summaryCalculationService');
const autoSyncService = require('../../../pay-register/services/autoSyncService');
const esiLeaveOtService = require('../../../overtime/services/esiLeaveOtService');
const {
  scheduleLeaveStatusSideEffects,
  runLeaveStatusSideEffects,
  serializeLeaveForSideEffects,
} = require('../leaveApprovalSideEffectsService');

const sampleLeave = {
  _id: '507f1f77bcf86cd799439011',
  employeeId: '507f1f77bcf86cd799439012',
  emp_no: 'E001',
  fromDate: new Date('2026-01-10'),
  toDate: new Date('2026-01-12'),
  status: 'approved',
  leaveType: 'CL',
};

function flushSetImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('leaveApprovalSideEffectsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('serializeLeaveForSideEffects keeps required fields', () => {
    const snap = serializeLeaveForSideEffects(sampleLeave);
    expect(snap._id).toBe(sampleLeave._id);
    expect(snap.emp_no).toBe('E001');
    expect(snap.status).toBe('approved');
  });

  test('skips heavy work for intermediate hod_approved status', async () => {
    const res = await runLeaveStatusSideEffects({ ...sampleLeave, status: 'hod_approved' });
    expect(res.skipped).toBe(true);
    expect(summaryCalculationService.recalculateOnLeaveApproval).not.toHaveBeenCalled();
    expect(autoSyncService.syncPayRegisterFromLeave).not.toHaveBeenCalled();
  });

  test('runs heavy work once for final approved status', async () => {
    const res = await runLeaveStatusSideEffects(sampleLeave);
    expect(res.ok).toBe(true);
    expect(summaryCalculationService.recalculateOnLeaveApproval).toHaveBeenCalledTimes(1);
    expect(autoSyncService.syncPayRegisterFromLeave).toHaveBeenCalledTimes(1);
    expect(esiLeaveOtService.syncEsiLeaveOtForLeave).not.toHaveBeenCalled();
  });

  test('runs ESI sync for ESI leave type', async () => {
    await runLeaveStatusSideEffects({ ...sampleLeave, leaveType: 'ESI' });
    expect(esiLeaveOtService.syncEsiLeaveOtForLeave).toHaveBeenCalledTimes(1);
  });

  test('dedupes duplicate schedule calls in same tick', async () => {
    scheduleLeaveStatusSideEffects(sampleLeave);
    scheduleLeaveStatusSideEffects(sampleLeave, { esiOptions: { requestedByUserId: 'u1' } });
    await flushSetImmediate();
    await flushSetImmediate();
    expect(summaryCalculationService.recalculateOnLeaveApproval).toHaveBeenCalledTimes(1);
    expect(autoSyncService.syncPayRegisterFromLeave).toHaveBeenCalledTimes(1);
  });

  test('recalculates extra snapshot on edit (old + new range)', async () => {
    const oldSnap = {
      ...sampleLeave,
      fromDate: new Date('2026-01-05'),
      toDate: new Date('2026-01-07'),
    };
    await runLeaveStatusSideEffects(sampleLeave, {
      forceHeavyRefresh: true,
      extraLeaveSnapshots: [oldSnap],
    });
    expect(summaryCalculationService.recalculateOnLeaveApproval).toHaveBeenCalledTimes(2);
    expect(autoSyncService.syncPayRegisterFromLeave).toHaveBeenCalledTimes(1);
  });
});
