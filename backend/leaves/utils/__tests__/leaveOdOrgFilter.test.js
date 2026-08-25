const mongoose = require('mongoose');
const {
  parseQueryObjectIds,
  applyLeaveOdOrgFilters,
  resolveLeaveOdOrgFilterClauses,
  clearLeaveOdOrgFilterCache,
} = require('../leaveOdOrgFilter');

describe('leaveOdOrgFilter', () => {
  beforeEach(() => {
    clearLeaveOdOrgFilterCache();
  });

  test('parseQueryObjectIds ignores all/empty and invalid', () => {
    expect(parseQueryObjectIds('all')).toEqual([]);
    expect(parseQueryObjectIds('')).toEqual([]);
    const id = new mongoose.Types.ObjectId();
    expect(parseQueryObjectIds(String(id))).toEqual([id]);
    expect(parseQueryObjectIds(`${id},bad,all`)).toEqual([id]);
  });

  test('applyLeaveOdOrgFilters ORs leave snapshot with current employee org', async () => {
    const divId = new mongoose.Types.ObjectId();
    const empId = new mongoose.Types.ObjectId();
    const Employee = {
      distinct: jest.fn(async () => [empId]),
    };

    const filter = { $and: [{ isActive: true }] };
    await applyLeaveOdOrgFilters(filter, { division: String(divId) }, Employee);

    expect(Employee.distinct).toHaveBeenCalledWith('_id', { division_id: { $in: [divId] } });
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[1]).toEqual({
      $or: [
        { division_id: divId },
        { employeeId: { $in: [empId] } },
      ],
    });
  });

  test('caches employee id lookups within TTL', async () => {
    const divId = new mongoose.Types.ObjectId();
    const empId = new mongoose.Types.ObjectId();
    const Employee = {
      distinct: jest.fn(async () => [empId]),
    };

    await resolveLeaveOdOrgFilterClauses({ division: String(divId) }, Employee);
    await resolveLeaveOdOrgFilterClauses({ division: String(divId) }, Employee);

    expect(Employee.distinct).toHaveBeenCalledTimes(1);
  });
});
