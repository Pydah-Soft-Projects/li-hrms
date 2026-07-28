const {
  isPromotionType,
  isTransferType,
  canViewModule,
  canManageModule,
  canManageRequestType,
  canViewRequestType,
  requestTypeVisibilityFilter,
  resolveFeatureControl,
} = require('../../promotions-transfers/utils/promotionTransferAccess');

function mockUser(overrides = {}) {
  return {
    role: 'hr',
    featureControl: [],
    customRoles: [],
    ...overrides,
  };
}

describe('promotionTransferAccess', () => {
  test('legacy PROMOTIONS_TRANSFERS:write grants both modules', () => {
    const user = mockUser({ featureControl: ['PROMOTIONS_TRANSFERS:write'] });
    expect(canManageModule(user, 'PROMOTIONS')).toBe(true);
    expect(canManageModule(user, 'TRANSFERS')).toBe(true);
    expect(canManageRequestType(user, 'promotion')).toBe(true);
    expect(canManageRequestType(user, 'transfer')).toBe(true);
    expect(canManageRequestType(user, 'increment')).toBe(true);
  });

  test('PROMOTIONS:write only allows promotion-path types', () => {
    const user = mockUser({ featureControl: ['PROMOTIONS:read', 'PROMOTIONS:write'] });
    expect(canManageRequestType(user, 'promotion')).toBe(true);
    expect(canManageRequestType(user, 'demotion')).toBe(true);
    expect(canManageRequestType(user, 'increment')).toBe(true);
    expect(canManageRequestType(user, 'transfer')).toBe(false);
    expect(canViewRequestType(user, 'transfer')).toBe(false);
    expect(requestTypeVisibilityFilter(user)).toEqual({
      requestType: { $in: expect.arrayContaining(['promotion', 'demotion', 'increment']) },
    });
  });

  test('TRANSFERS:write only allows transfers', () => {
    const user = mockUser({ featureControl: ['TRANSFERS:read', 'TRANSFERS:write'] });
    expect(canManageRequestType(user, 'transfer')).toBe(true);
    expect(canManageRequestType(user, 'promotion')).toBe(false);
    expect(canViewModule(user, 'PROMOTIONS')).toBe(false);
    expect(requestTypeVisibilityFilter(user)).toEqual({ requestType: 'transfer' });
  });

  test('both modules grant null type filter (see all)', () => {
    const user = mockUser({
      featureControl: ['PROMOTIONS:read', 'PROMOTIONS:write', 'TRANSFERS:read', 'TRANSFERS:write'],
    });
    expect(requestTypeVisibilityFilter(user)).toBeNull();
  });

  test('read-only promotions cannot manage', () => {
    const user = mockUser({ featureControl: ['PROMOTIONS:read'] });
    expect(canViewRequestType(user, 'promotion')).toBe(true);
    expect(canManageRequestType(user, 'promotion')).toBe(false);
  });

  test('type helpers', () => {
    expect(isPromotionType('increment')).toBe(true);
    expect(isTransferType('transfer')).toBe(true);
    expect(isPromotionType('transfer')).toBe(false);
  });

  test('resolveFeatureControl merges custom roles', () => {
    const user = mockUser({
      featureControl: ['PROMOTIONS:read'],
      customRoles: [{ isActive: true, activeModules: ['TRANSFERS:write'] }],
    });
    const fc = resolveFeatureControl(user);
    expect(fc).toEqual(expect.arrayContaining(['PROMOTIONS:read', 'TRANSFERS:write']));
    expect(canManageRequestType(user, 'transfer')).toBe(true);
  });
});
