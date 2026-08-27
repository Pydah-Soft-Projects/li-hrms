/**
 * Unit tests: Leave/OD list + pending org filters keep previous-org stamped requests visible.
 */
jest.mock('../../../employees/model/Employee', () => ({
  find: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../../users/model/User', () => ({
  findById: jest.fn(),
}));

const {
  buildLeaveOdListScopeFilters,
  buildLeaveOdPendingOrgFilter,
  buildScopeFilter,
} = require('../dataScopeMiddleware');
const Employee = require('../../../employees/model/Employee');

describe('buildLeaveOdListScopeFilters / pending org filter', () => {
  const greenDiv = '6957b0ea90c14ea32bbe4fa9';
  const managerUser = {
    _id: 'mgr-user-1',
    role: 'manager',
    employeeId: '1587',
    employeeRef: 'emp-ref-1587',
    dataScope: 'divisions',
    divisionMapping: [{ division: greenDiv, departments: [] }],
  };

  beforeEach(() => {
    Employee.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    });
  });

  test('visibility includes stamped-org scope even when employee transferred away', async () => {
    const scopeFilter = buildScopeFilter(managerUser);
    const { jurisdictionFilter, visibilityFilter } = await buildLeaveOdListScopeFilters(
      managerUser,
      scopeFilter
    );

    expect(jurisdictionFilter).toEqual(scopeFilter);
    expect(visibilityFilter.$or).toEqual(expect.arrayContaining([scopeFilter]));
    expect(visibilityFilter.$or.length).toBeGreaterThanOrEqual(2);

    // Stamped Green Campus OD is reachable via scopeFilter visibility leg
    expect(JSON.stringify(visibilityFilter)).toContain(greenDiv);
  });

  test('pending org filter includes stamped division when employee not in scope', async () => {
    const scopeFilter = buildScopeFilter(managerUser);
    const orgFilter = await buildLeaveOdPendingOrgFilter(managerUser, scopeFilter);

    expect(orgFilter.$or).toHaveLength(2);
    expect(orgFilter.$or[0]).toEqual({ employeeId: { $in: [] } });
    expect(JSON.stringify(orgFilter.$or[1])).toContain(greenDiv);
  });

  test('when employees remain in scope, visibility keeps employeeId OR stamped org', async () => {
    Employee.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ _id: 'still-in-scope' }]),
    });
    const scopeFilter = buildScopeFilter(managerUser);
    const { visibilityFilter, scopedEmployeeIds } = await buildLeaveOdListScopeFilters(
      managerUser,
      scopeFilter
    );

    expect(scopedEmployeeIds).toEqual(['still-in-scope']);
    expect(visibilityFilter.$or).toEqual(
      expect.arrayContaining([
        scopeFilter,
        { employeeId: { $in: ['still-in-scope'] } },
      ])
    );
  });
});
