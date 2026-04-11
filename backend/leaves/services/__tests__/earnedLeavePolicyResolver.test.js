const {
  resolveEffectiveEarnedLeave,
} = require('../earnedLeavePolicyResolver');

describe('resolveEffectiveEarnedLeave', () => {
  const globalEl = {
    enabled: true,
    earningType: 'attendance_based',
    useAsPaidInPayroll: true,
    attendanceRules: {
      minDaysForFirstEL: 20,
      daysPerEL: 20,
      maxELPerMonth: 2,
      maxELPerYear: 12,
      attendanceRanges: [{ minDays: 1, maxDays: 31, elEarned: 1, description: 'g' }],
    },
    fixedRules: { elPerMonth: 1, maxELPerYear: 12 },
  };

  it('returns global policy when department has no leaves config', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, null);
    expect(r.enabled).toBe(true);
    expect(r.earningType).toBe('attendance_based');
    expect(r.useAsPaidInPayroll).toBe(true);
    expect(r.attendanceRules.minDaysForFirstEL).toBe(20);
    expect(r.attendanceRules.attendanceRanges).toHaveLength(1);
  });

  it('disables EL when department sets earnedLeave.enabled false', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, {
      earnedLeave: { enabled: false },
    });
    expect(r.enabled).toBe(false);
  });

  it('uses legacy elEarningType when earnedLeave.earningType not set', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, { elEarningType: 'fixed' });
    expect(r.earningType).toBe('fixed');
  });

  it('prefers earnedLeave.earningType over legacy elEarningType', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, {
      elEarningType: 'fixed',
      earnedLeave: { earningType: 'attendance_based' },
    });
    expect(r.earningType).toBe('attendance_based');
  });

  it('merges partial attendance rules from department', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, {
      earnedLeave: {
        attendanceRules: { maxELPerMonth: 5, daysPerEL: 10 },
      },
    });
    expect(r.attendanceRules.maxELPerMonth).toBe(5);
    expect(r.attendanceRules.daysPerEL).toBe(10);
    expect(r.attendanceRules.minDaysForFirstEL).toBe(20);
  });

  it('replaces attendance ranges when department provides a non-empty list', () => {
    const deptRanges = [{ minDays: 25, maxDays: 31, elEarned: 3, description: 'd' }];
    const r = resolveEffectiveEarnedLeave(globalEl, {
      earnedLeave: { attendanceRules: { attendanceRanges: deptRanges } },
    });
    expect(r.attendanceRules.attendanceRanges).toEqual(deptRanges);
  });

  it('uses department useAsPaidInPayroll when set', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, {
      earnedLeave: { useAsPaidInPayroll: false },
    });
    expect(r.useAsPaidInPayroll).toBe(false);
  });

  it('merges fixed rules from department', () => {
    const r = resolveEffectiveEarnedLeave(globalEl, {
      earnedLeave: { fixedRules: { elPerMonth: 2 } },
    });
    expect(r.fixedRules.elPerMonth).toBe(2);
    expect(r.fixedRules.maxELPerYear).toBe(12);
  });
});
