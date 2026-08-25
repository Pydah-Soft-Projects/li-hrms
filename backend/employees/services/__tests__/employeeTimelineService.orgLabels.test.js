const {
  toOrgLabelRef,
  applyOrgLabelsToDynamicFields,
  overlayOrgDynamicFields,
  applyOrgChange,
  startOfUtcDay,
} = require('../employeeTimelineService');

describe('org dynamicFields label sync', () => {
  test('toOrgLabelRef copies id name code', () => {
    const ref = toOrgLabelRef({ _id: 'div1', name: 'Degree', code: 'DEG' });
    expect(ref).toEqual({ _id: 'div1', name: 'Degree', code: 'DEG', id: 'div1' });
  });

  test('applyOrgLabelsToDynamicFields overwrites stale division labels', () => {
    const emp = {
      dynamicFields: {
        division: { _id: 'old', name: 'PYDAH DIPLOMA', code: 'PYDD', id: 'old' },
        division_name: 'PYDAH DIPLOMA',
        department: { _id: 'dept1', name: 'OFFICE', code: 'OFFICE', id: 'dept1' },
        department_name: 'OFFICE',
      },
      markModified: jest.fn(),
    };

    const changed = applyOrgLabelsToDynamicFields(emp, {
      division: { _id: 'new', name: 'PYDAH VRT DEGREE COLLEGE (GREEN CAMPUS)', code: 'PYDE DEGREE' },
      department: { _id: 'dept1', name: 'OFFICE', code: 'OFFICE' },
    });

    expect(changed).toBe(true);
    expect(emp.dynamicFields.division_name).toBe('PYDAH VRT DEGREE COLLEGE (GREEN CAMPUS)');
    expect(emp.dynamicFields.division.id).toBe('new');
    expect(emp.dynamicFields.department_name).toBe('OFFICE');
    expect(emp.markModified).toHaveBeenCalledWith('dynamicFields');
  });

  test('applyOrgLabelsToDynamicFields is a no-op when already in sync', () => {
    const emp = {
      dynamicFields: {
        division: { _id: 'new', name: 'Degree', code: 'DEG', id: 'new' },
        division_name: 'Degree',
      },
      markModified: jest.fn(),
    };
    const changed = applyOrgLabelsToDynamicFields(emp, {
      division: { _id: 'new', name: 'Degree', code: 'DEG' },
    });
    expect(changed).toBe(false);
    expect(emp.markModified).not.toHaveBeenCalled();
  });

  test('overlayOrgDynamicFields copies only org label keys', () => {
    const target = { reporting_to: ['u1'], division_name: 'Old' };
    overlayOrgDynamicFields(target, { division_name: 'New', extra: 'nope' });
    expect(target.division_name).toBe('New');
    expect(target.reporting_to).toEqual(['u1']);
    expect(target.extra).toBeUndefined();
  });

  test('applyOrgChange still writes master division_id', () => {
    const emp = {
      division_id: 'oldDiv',
      department_id: 'dept1',
      designation_id: 'des1',
      orgHistory: [],
      salaryHistory: [],
    };
    applyOrgChange(emp, {
      division_id: 'newDiv',
      department_id: 'dept1',
      designation_id: 'des1',
      effectiveFrom: startOfUtcDay(new Date()),
      source: 'transfer',
      applyMaster: true,
    });
    expect(String(emp.division_id)).toBe('newDiv');
  });
});
