/**
 * Simulates the three Mongo rows and asserts merge order for getByDeptAndDiv:
 *   department+division > division-wide > department default (same dept)
 * Plus: dept-only and division-only call shapes.
 */

const DepartmentSettings = require('../DepartmentSettings');

const DEPT_ID = '507f1f77bcf86cd799439011';
const DIV_ID = '507f1f77bcf86cd799439012';

/** Plain objects are fine — toPlainDoc copies them. */
function row(partial) {
  return { ...partial };
}

describe('DepartmentSettings.getByDeptAndDiv hierarchy (simulated DB rows)', () => {
  let findOneSpy;

  afterEach(() => {
    if (findOneSpy) findOneSpy.mockRestore();
  });

  it('merges loans: dept+div wins over division-wide wins over department default', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (filter.department == null && String(filter.division) === DIV_ID) {
        return row({
          department: null,
          division: DIV_ID,
          loans: { minAmount: 100, maxAmount: 5000 },
        });
      }
      if (String(filter.department) === DEPT_ID && filter.division == null) {
        return row({
          department: DEPT_ID,
          division: null,
          loans: { minAmount: 500, maxAmount: 10000 },
        });
      }
      if (String(filter.department) === DEPT_ID && String(filter.division) === DIV_ID) {
        return row({
          department: DEPT_ID,
          division: DIV_ID,
          loans: { minAmount: 999, maxAmount: 2000 },
        });
      }
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(DEPT_ID, DIV_ID);
    expect(merged.loans.minAmount).toBe(999);
    expect(merged.loans.maxAmount).toBe(2000);
  });

  it('when dept+div row is missing, division-wide overrides department default', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (filter.department == null && String(filter.division) === DIV_ID) {
        return row({
          department: null,
          division: DIV_ID,
          loans: { minAmount: 50 },
        });
      }
      if (String(filter.department) === DEPT_ID && filter.division == null) {
        return row({
          department: DEPT_ID,
          division: null,
          loans: { minAmount: 500 },
        });
      }
      if (String(filter.department) === DEPT_ID && String(filter.division) === DIV_ID) {
        return null;
      }
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(DEPT_ID, DIV_ID);
    expect(merged.loans.minAmount).toBe(50);
  });

  it('when only department default exists (with division in query), that row is the base and no div-wide/dept+div', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (filter.department == null && String(filter.division) === DIV_ID) return null;
      if (String(filter.department) === DEPT_ID && filter.division == null) {
        return row({ department: DEPT_ID, division: null, loans: { minAmount: 77 } });
      }
      if (String(filter.department) === DEPT_ID && String(filter.division) === DIV_ID) return null;
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(DEPT_ID, DIV_ID);
    expect(merged.loans.minAmount).toBe(77);
  });

  it('department only (no division): returns only the (dept, null) row — no division-wide merge', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (String(filter.department) === DEPT_ID && filter.division == null) {
        return row({ department: DEPT_ID, division: null, loans: { minAmount: 300 } });
      }
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(DEPT_ID, null);
    expect(merged.loans.minAmount).toBe(300);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });

  it('division only (no department): returns division-wide row plain', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (filter.department == null && String(filter.division) === DIV_ID) {
        return row({ department: null, division: DIV_ID, loans: { minAmount: 42 } });
      }
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(null, DIV_ID);
    expect(merged.loans.minAmount).toBe(42);
    expect(findOneSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves.earnedLeave: dept+div overrides division-wide nested EL', async () => {
    findOneSpy = jest.spyOn(DepartmentSettings, 'findOne').mockImplementation(async (filter) => {
      if (filter.department == null && String(filter.division) === DIV_ID) {
        return row({
          department: null,
          division: DIV_ID,
          leaves: {
            leavesPerDay: 1,
            earnedLeave: { enabled: true, earningType: 'fixed', attendanceRules: { daysPerEL: 15 } },
          },
        });
      }
      if (String(filter.department) === DEPT_ID && filter.division == null) {
        return row({
          department: DEPT_ID,
          division: null,
          leaves: {
            leavesPerDay: 0.5,
            earnedLeave: { enabled: true, earningType: 'attendance_based', attendanceRules: { daysPerEL: 20 } },
          },
        });
      }
      if (String(filter.department) === DEPT_ID && String(filter.division) === DIV_ID) {
        return row({
          department: DEPT_ID,
          division: DIV_ID,
          leaves: {
            earnedLeave: { earningType: 'fixed', attendanceRules: { daysPerEL: 7 } },
          },
        });
      }
      return null;
    });

    const merged = await DepartmentSettings.getByDeptAndDiv(DEPT_ID, DIV_ID);
    expect(merged.leaves.leavesPerDay).toBe(1);
    expect(merged.leaves.earnedLeave.earningType).toBe('fixed');
    expect(merged.leaves.earnedLeave.attendanceRules.daysPerEL).toBe(7);
  });
});
