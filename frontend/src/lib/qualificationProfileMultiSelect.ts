/**
 * Multi-select expansion for qualification profile scopes.
 * Shared by Form Settings UI and simulation tests.
 *
 * One stored QualificationProfile per scopeKey — multi-select fans out to N upserts.
 */

export type QualificationScopeType =
  | 'division'
  | 'department'
  | 'designation'
  | 'department_designation'
  | 'division_designation'
  | 'division_department'
  | 'division_department_designation';

export type ScopeCombo = {
  division_id: string | null;
  department_id: string | null;
  designation_id: string | null;
};

export type DeptMeta = { _id: string; name?: string; division_id?: string | { _id?: string } | null };

const SCOPE_REQUIRED: Record<QualificationScopeType, Array<'division_id' | 'department_id' | 'designation_id'>> = {
  division: ['division_id'],
  department: ['department_id'],
  designation: ['designation_id'],
  department_designation: ['department_id', 'designation_id'],
  division_designation: ['division_id', 'designation_id'],
  division_department: ['division_id', 'department_id'],
  division_department_designation: ['division_id', 'department_id', 'designation_id'],
};

export function scopeNeeds(
  scopeType: QualificationScopeType,
  field: 'division_id' | 'department_id' | 'designation_id'
): boolean {
  return SCOPE_REQUIRED[scopeType].includes(field);
}

export function deptDivisionId(dept: DeptMeta): string {
  const dDiv = dept.division_id;
  if (!dDiv) return '';
  return typeof dDiv === 'object' ? String(dDiv._id || '') : String(dDiv);
}

/**
 * Expand multi-selected org units into one stored profile per combination.
 * When both division + department are required, skip dept↔div pairs that conflict
 * with a known department.division_id link.
 */
export function expandScopeCombos(
  scopeType: QualificationScopeType,
  divisionIds: string[],
  departmentIds: string[],
  designationIds: string[],
  departments: DeptMeta[] = []
): ScopeCombo[] {
  const needsDiv = scopeNeeds(scopeType, 'division_id');
  const needsDept = scopeNeeds(scopeType, 'department_id');
  const needsDes = scopeNeeds(scopeType, 'designation_id');

  const divs: Array<string | null> = needsDiv ? divisionIds.map(String) : [null];
  const depts: Array<string | null> = needsDept ? departmentIds.map(String) : [null];
  const dess: Array<string | null> = needsDes ? designationIds.map(String) : [null];

  const combos: ScopeCombo[] = [];
  for (const div of divs) {
    for (const dept of depts) {
      if (needsDiv && needsDept && div && dept) {
        const meta = departments.find((d) => String(d._id) === String(dept));
        const linked = meta ? deptDivisionId(meta) : '';
        if (linked && linked !== div) continue;
      }
      for (const des of dess) {
        combos.push({
          division_id: div,
          department_id: dept,
          designation_id: des,
        });
      }
    }
  }
  return combos;
}
