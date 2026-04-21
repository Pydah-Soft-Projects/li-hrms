/**
 * Simulations for promotion/transfer completion notifications (money & org sensitive).
 * Verifies who receives in-app notifications and when scoped (new org) resolution is skipped.
 */

jest.mock('../../model/PromotionTransferRequest', () => ({
  findById: jest.fn(),
}));

jest.mock('../../../users/model/User', () => ({
  find: jest.fn(),
}));

jest.mock('../../../notifications/services/notificationService', () => ({
  createNotifications: jest.fn().mockResolvedValue([{ _id: 'mock-notif' }]),
}));

jest.mock('../../../shared/utils/scopedNotificationRecipients', () => ({
  uniqueIds: jest.requireActual('../../../shared/utils/scopedNotificationRecipients').uniqueIds,
  isObjectIdLike: jest.requireActual('../../../shared/utils/scopedNotificationRecipients').isObjectIdLike,
  resolveSuperAdminUserIds: jest.fn(),
  resolveScopedUserIdsForEmployee: jest.fn(),
  resolveEmployeePortalUserIds: jest.fn(),
}));

const PromotionTransferRequest = require('../../model/PromotionTransferRequest');
const User = require('../../../users/model/User');
const { createNotifications } = require('../../../notifications/services/notificationService');
const {
  resolveSuperAdminUserIds,
  resolveScopedUserIdsForEmployee,
  resolveEmployeePortalUserIds,
} = require('../../../shared/utils/scopedNotificationRecipients');

const { notifyPromotionTransferCompleted } = require('../promotionTransferNotificationService');

const OID = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

function mockLeanChain(result) {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  PromotionTransferRequest.findById.mockReturnValue(chain);
}

describe('promotionTransferNotificationService (simulation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  it('sends detail + summary for transfer with super admin, employee portal user, and new-org scoped user', async () => {
    const rid = OID(10);
    const empId = OID(20);
    const divFrom = OID(30);
    const divTo = OID(31);
    const deptFrom = OID(40);
    const deptTo = OID(41);
    const superId = OID(1);
    const empUserId = OID(2);
    const scopedHrId = OID(3);

    mockLeanChain({
      _id: rid,
      requestType: 'transfer',
      emp_no: 'E001',
      employeeId: { _id: empId, employee_name: 'Test User', emp_no: 'E001' },
      fromDivisionId: { _id: divFrom, name: 'Div Old' },
      fromDepartmentId: { _id: deptFrom, name: 'Dept Old' },
      fromDesignationId: { name: 'Exec' },
      toDivisionId: { _id: divTo, name: 'Div New' },
      toDepartmentId: { _id: deptTo, name: 'Dept New' },
      toDesignationId: { name: 'Sr Exec' },
      previousGrossSalary: 50000,
      newGrossSalary: 52000,
      effectivePayrollYear: 2026,
      effectivePayrollMonth: 4,
      remarks: 'Approved transfer',
    });

    resolveSuperAdminUserIds.mockResolvedValue([superId]);
    resolveEmployeePortalUserIds.mockResolvedValue([empUserId]);
    resolveScopedUserIdsForEmployee.mockResolvedValue([scopedHrId]);

    const out = await notifyPromotionTransferCompleted({ _id: rid }, { _id: OID(9), name: 'Approver', role: 'super_admin' });

    expect(createNotifications).toHaveBeenCalledTimes(2);
    const detailCall = createNotifications.mock.calls.find((c) => c[0].dedupeKey.includes(':detail:'));
    const summaryCall = createNotifications.mock.calls.find((c) => c[0].dedupeKey.includes(':summary:'));

    expect(detailCall[0].module).toBe('promotion_transfer');
    expect(detailCall[0].recipientUserIds).toContain(superId);
    expect(detailCall[0].message).toContain('Request type: transfer');
    expect(detailCall[0].message).toContain('Div Old');
    expect(detailCall[0].message).toContain('Div New');
    expect(detailCall[0].meta.hasOrgMove).toBe(true);

    expect(summaryCall[0].recipientUserIds.sort()).toEqual([empUserId, scopedHrId].sort());
    expect(summaryCall[0].message).toContain('organisation is now');
    expect(resolveScopedUserIdsForEmployee).toHaveBeenCalledTimes(1);

    expect(out.detailCount).toBe(1);
    expect(out.summaryCount).toBe(2);
    expect(out.hasOrgMove).toBe(true);
  });

  it('does not resolve new-org scoped users when promotion has no org move (salary-only path)', async () => {
    const rid = OID(11);
    const sameDiv = OID(50);
    const sameDept = OID(51);
    const superId = OID(1);
    const empUserId = OID(2);

    mockLeanChain({
      _id: rid,
      requestType: 'promotion',
      emp_no: 'E002',
      employeeId: { _id: OID(21), employee_name: 'Promo Only', emp_no: 'E002' },
      fromDivisionId: { _id: sameDiv, name: 'Same Div' },
      toDivisionId: { _id: sameDiv, name: 'Same Div' },
      fromDepartmentId: { _id: sameDept, name: 'Same Dept' },
      toDepartmentId: { _id: sameDept, name: 'Same Dept' },
      previousGrossSalary: 40000,
      newGrossSalary: 45000,
      effectivePayrollYear: 2026,
      effectivePayrollMonth: 5,
      remarks: '',
    });

    resolveSuperAdminUserIds.mockResolvedValue([superId]);
    resolveEmployeePortalUserIds.mockResolvedValue([empUserId]);
    resolveScopedUserIdsForEmployee.mockResolvedValue([OID(99)]);

    const out = await notifyPromotionTransferCompleted({ _id: rid }, { _id: OID(8), name: 'HR Head', role: 'hr' });

    expect(resolveScopedUserIdsForEmployee).not.toHaveBeenCalled();
    expect(out.hasOrgMove).toBe(false);

    expect(createNotifications).toHaveBeenCalledTimes(2);
    const summaryCall = createNotifications.mock.calls.find((c) => c[0].dedupeKey.includes(':summary:'));
    expect(summaryCall[0].recipientUserIds).toEqual([empUserId]);
    expect(summaryCall[0].message).toContain('compensation update');
  });

  it('excludes approver from summary scoped recipients (no duplicate self-notify for acting HR in new dept)', async () => {
    const rid = OID(12);
    const divTo = OID(60);
    const deptTo = OID(61);
    const approverScopedId = OID(4);

    mockLeanChain({
      _id: rid,
      requestType: 'transfer',
      emp_no: 'E003',
      employeeId: { _id: OID(22), employee_name: 'Mover', emp_no: 'E003' },
      fromDivisionId: { _id: OID(62), name: 'A' },
      fromDepartmentId: { _id: OID(63), name: 'B' },
      toDivisionId: { _id: divTo, name: 'ToDiv' },
      toDepartmentId: { _id: deptTo, name: 'ToDept' },
      toDesignationId: { name: 'Staff' },
      effectivePayrollYear: 2026,
      effectivePayrollMonth: 6,
    });

    resolveSuperAdminUserIds.mockResolvedValue([]);
    resolveEmployeePortalUserIds.mockResolvedValue([]);
    resolveScopedUserIdsForEmployee.mockResolvedValue([approverScopedId, OID(5)]);

    await notifyPromotionTransferCompleted({ _id: rid }, { _id: approverScopedId, name: 'Self HR', role: 'hr' });

    const summaryCall = createNotifications.mock.calls.find((c) => c[0].dedupeKey.includes(':summary:'));
    expect(summaryCall[0].recipientUserIds).toEqual([OID(5)]);
    expect(summaryCall[0].recipientUserIds).not.toContain(approverScopedId);
  });

  it('sends no notifications when request document cannot be reloaded (skipped)', async () => {
    mockLeanChain(null);
    const out = await notifyPromotionTransferCompleted({ _id: OID(77) }, { _id: OID(1), name: 'A', role: 'super_admin' });
    expect(createNotifications).not.toHaveBeenCalled();
    expect(out.skipped).toBe(true);
  });

  it('does not send summary batch when there are no employee portal users and no scoped recipients', async () => {
    const rid = OID(13);
    mockLeanChain({
      _id: rid,
      requestType: 'increment',
      emp_no: 'E004',
      employeeId: { _id: OID(23), employee_name: 'Inc', emp_no: 'E004' },
      incrementAmount: 1000,
      newGrossSalary: 51000,
      previousGrossSalary: 50000,
      effectivePayrollYear: 2026,
      effectivePayrollMonth: 7,
    });

    resolveSuperAdminUserIds.mockResolvedValue([OID(1)]);
    resolveEmployeePortalUserIds.mockResolvedValue([]);
    resolveScopedUserIdsForEmployee.mockResolvedValue([]);

    const out = await notifyPromotionTransferCompleted({ _id: rid }, { _id: OID(2), name: 'Admin', role: 'super_admin' });

    expect(createNotifications).toHaveBeenCalledTimes(1);
    expect(out.detailCount).toBe(1);
    expect(out.summaryCount).toBe(0);
  });
});
