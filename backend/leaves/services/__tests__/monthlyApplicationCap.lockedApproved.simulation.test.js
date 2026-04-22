/**
 * Simulates "locked" vs "used" (approved) for monthly apply buckets — same rules as the register Lk column.
 */
const { addLeaveCapToMonthlyBuckets, getConfiguredMonthlyTypeCap } = require('../monthlyApplicationCapService');

function emptyBucket() {
  return {
    capConsumedDays: 0,
    capLockedDays: 0,
    capApprovedDays: 0,
    pendingCapDaysInFlight: 0,
    lockedClAppDays: 0,
    lockedCclAppDays: 0,
    lockedElAppDays: 0,
    approvedClCapDays: 0,
    approvedCclCapDays: 0,
    approvedElCapDays: 0,
    approvedAppDaysByType: Object.create(null),
    lockedAppDaysByType: Object.create(null),
  };
}

const winApr = {
  key: '2026-04',
  start: new Date(Date.UTC(2026, 3, 1)),
  end: new Date(Date.UTC(2026, 3, 30, 23, 59, 59)),
};

describe('monthlyApplicationCap.locked vs approved (simulation)', () => {
  const policy = {
    earnedLeave: { enabled: true, useAsPaidInPayroll: true },
    monthlyLeaveApplicationCap: { maxDaysByType: { CL: 5, CCL: 3, EL: 2, PL: 4 } },
  };

  it('pending CCL request increments lockedCclAppDays, not approved', async () => {
    const pendingByMonthKey = { [winApr.key]: emptyBucket() };
    const leave = {
      _id: null,
      status: 'pending',
      leaveType: 'CCL',
      numberOfDays: 2,
      fromDate: new Date(Date.UTC(2026, 3, 15)),
      toDate: new Date(Date.UTC(2026, 3, 15)),
      splitStatus: '',
    };
    await addLeaveCapToMonthlyBuckets(leave, policy, [winApr], pendingByMonthKey);
    const b = pendingByMonthKey[winApr.key];
    expect(b.approvedCclCapDays).toBe(0);
    expect(b.lockedCclAppDays).toBe(2);
    expect(b.lockedAppDaysByType.CCL).toBe(2);
    expect(b.approvedAppDaysByType.CCL).toBeUndefined();
  });

  it('fully approved CCL request increments approvedCclCapDays', async () => {
    const pendingByMonthKey = { [winApr.key]: emptyBucket() };
    const leave = {
      _id: null,
      status: 'approved',
      leaveType: 'CCL',
      numberOfDays: 1,
      fromDate: new Date(Date.UTC(2026, 3, 10)),
      toDate: new Date(Date.UTC(2026, 3, 10)),
      splitStatus: '',
    };
    await addLeaveCapToMonthlyBuckets(leave, policy, [winApr], pendingByMonthKey);
    const b = pendingByMonthKey[winApr.key];
    expect(b.lockedCclAppDays).toBe(0);
    expect(b.approvedCclCapDays).toBe(1);
    expect(b.approvedAppDaysByType.CCL).toBe(1);
  });

  it('hod_approved (pipeline) CCL counts as locked, not approved', async () => {
    const pendingByMonthKey = { [winApr.key]: emptyBucket() };
    const leave = {
      _id: null,
      status: 'hod_approved',
      leaveType: 'CCL',
      numberOfDays: 1.5,
      fromDate: new Date(Date.UTC(2026, 3, 20)),
      toDate: new Date(Date.UTC(2026, 3, 20)),
      splitStatus: '',
    };
    await addLeaveCapToMonthlyBuckets(leave, policy, [winApr], pendingByMonthKey);
    const b = pendingByMonthKey[winApr.key];
    expect(b.lockedCclAppDays).toBe(1.5);
    expect(b.approvedCclCapDays).toBe(0);
  });

  it('getConfiguredMonthlyTypeCap reads maxDaysByType for arbitrary policy codes', () => {
    const p2 = { monthlyLeaveApplicationCap: { maxDaysByType: { PL: 4, SL: 1 } } };
    expect(getConfiguredMonthlyTypeCap(p2, 'PL')).toBe(4);
    expect(getConfiguredMonthlyTypeCap(p2, 'SL')).toBe(1);
  });
});
