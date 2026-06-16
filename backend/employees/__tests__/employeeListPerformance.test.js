/**
 * Unit tests for employee list optimization helpers (via controller exports).
 */
const {
  buildActiveEmployeeFilters,
  mapSummaryEmployeeRow,
  applyDepartmentIdFilter,
} = require('../controllers/employeeController');

describe('employee list performance helpers', () => {
  test('buildActiveEmployeeFilters applies comma-separated department_ids', () => {
    const filters = buildActiveEmployeeFilters(
      { department_ids: 'a,b,c', is_active: 'true' },
      { division_id: 'div1' }
    );
    expect(filters.division_id).toBe('div1');
    expect(filters.is_active).toBe(true);
    expect(filters.department_id).toEqual({ $in: ['a', 'b', 'c'] });
  });

  test('applyDepartmentIdFilter single id', () => {
    const filters = {};
    applyDepartmentIdFilter(filters, 'dept1', undefined);
    expect(filters.department_id).toBe('dept1');
  });

  test('mapSummaryEmployeeRow returns lean shape', () => {
    const row = mapSummaryEmployeeRow({
      _id: '1',
      emp_no: 'E001',
      employee_name: 'Test User',
      division_id: { name: 'Div' },
      department_id: { name: 'Dept' },
      designation_id: { name: 'Des' },
      is_active: true,
    });
    expect(row.emp_no).toBe('E001');
    expect(row.division).toEqual(row.division_id);
    expect(row.employee_name).toBe('Test User');
  });

  test('buildActiveEmployeeFilters excludes left employees by default', () => {
    const filters = buildActiveEmployeeFilters({}, {});
    expect(filters.$and).toBeDefined();
    expect(filters.$and.some((c) => c.$or)).toBe(true);
  });
});
