import type { Department, Division } from '@/lib/api';
import {
  buildDivisionToDepartmentIdsMap,
  getDepartmentsForDivision,
} from '@/lib/divisionDepartmentUtils';

export type ScopeUser = {
  role?: string;
  featureControl?: string[];
  dataScope?: string;
  scope?: string;
  division?: string | { _id: string };
  department?: string | { _id: string };
  departments?: Array<string | { _id: string }>;
  allowedDivisions?: unknown[];
  divisionMapping?: Array<{
    division: string | { _id: string };
    departments?: Array<string | { _id: string }>;
  }>;
};

export type WorkspaceScopeConfig = {
  divisions?: unknown[];
  departments?: unknown[];
};

function refId(ref: unknown): string {
  if (ref == null) return '';
  return String(typeof ref === 'string' ? ref : (ref as { _id: string })._id);
}

/** Divisions visible to the current user (access scope + optional workspace module scope). */
export function getScopedDivisions(
  divisions: Division[],
  user: ScopeUser | null,
  workspaceScope?: WorkspaceScopeConfig | null
): Division[] {
  let divs = divisions;
  if (user && user.dataScope !== 'all' && user.role !== 'super_admin') {
    if (user.allowedDivisions && user.allowedDivisions.length > 0) {
      const allowedIds = new Set(user.allowedDivisions.map(refId));
      divs = divs.filter((d) => allowedIds.has(String(d._id)));
    } else if (user.divisionMapping && user.divisionMapping.length > 0) {
      const mappedDivIds = new Set(user.divisionMapping.map((m) => refId(m.division)));
      divs = divs.filter((d) => mappedDivIds.has(String(d._id)));
    } else if (user.division) {
      const divId = refId(user.division);
      divs = divs.filter((d) => String(d._id) === divId);
    } else if (user.scope === 'restricted') {
      divs = [];
    }
  }
  if (workspaceScope?.divisions && workspaceScope.divisions.length > 0) {
    const allow = new Set(workspaceScope.divisions.map(refId));
    divs = divs.filter((d) => allow.has(String(d._id)));
  }
  return divs;
}

/** Departments for a division, further limited by user divisionMapping / department access. */
export function getScopedDepartmentsForDivision(
  selectedDivisionId: string,
  divisions: Division[],
  departments: Department[],
  divisionDeptMap: Map<string, Set<string>>,
  user: ScopeUser | null
): Department[] {
  const eligibleDepts = selectedDivisionId
    ? getDepartmentsForDivision(selectedDivisionId, divisions, departments, divisionDeptMap)
    : departments;

  if (!user || user.dataScope === 'all' || user.role === 'super_admin') {
    return eligibleDepts;
  }

  if (selectedDivisionId) {
    if (user.divisionMapping && user.divisionMapping.length > 0) {
      const mapping = user.divisionMapping.find(
        (m) => refId(m.division) === String(selectedDivisionId)
      );
      if (mapping) {
        if (!mapping.departments || mapping.departments.length === 0) return eligibleDepts;
        const allowedDeptIds = new Set(mapping.departments.map(refId));
        const scoped = eligibleDepts.filter((d) => allowedDeptIds.has(String(d._id)));
        return scoped.length > 0 ? scoped : eligibleDepts;
      }
    }

    if (user.allowedDivisions && user.allowedDivisions.length > 0) {
      const allowedDivIds = user.allowedDivisions.map(refId);
      if (allowedDivIds.includes(String(selectedDivisionId))) {
        if (user.departments && user.departments.length > 0) {
          const allowedDeptIds = new Set(user.departments.map(refId));
          const scoped = eligibleDepts.filter((d) => allowedDeptIds.has(String(d._id)));
          return scoped.length > 0 ? scoped : eligibleDepts;
        }
        return eligibleDepts;
      }
    }

    return eligibleDepts;
  }

  if (user.divisionMapping && user.divisionMapping.length > 0) {
    const pool: Department[] = [];
    for (const m of user.divisionMapping) {
      const mDivId = refId(m.division);
      pool.push(...getDepartmentsForDivision(mDivId, divisions, departments, divisionDeptMap));
    }
    return Array.from(new Map(pool.map((d) => [String(d._id), d])).values());
  }

  if (user.departments && user.departments.length > 0) {
    const allowedDeptIds = new Set(user.departments.map(refId));
    return departments.filter((d) => allowedDeptIds.has(String(d._id)));
  }

  if (user.department) {
    const deptId = refId(user.department);
    return departments.filter((d) => String(d._id) === deptId);
  }

  return eligibleDepts;
}

/** Department filter options for a single selected division (or all scoped divisions when none selected). */
export function getScopedDepartmentFilterOptions(
  selectedDivisionId: string,
  scopedDivisions: Division[],
  divisions: Division[],
  departments: Department[],
  user: ScopeUser | null,
  workspaceScope?: WorkspaceScopeConfig | null
): Department[] {
  const divisionDeptMap = buildDivisionToDepartmentIdsMap(divisions, departments);

  let pool: Department[];
  if (!selectedDivisionId) {
    pool = [];
    for (const d of scopedDivisions) {
      pool.push(
        ...getScopedDepartmentsForDivision(
          String(d._id),
          divisions,
          departments,
          divisionDeptMap,
          user
        )
      );
    }
    pool = Array.from(new Map(pool.map((x) => [String(x._id), x])).values());
  } else {
    pool = getScopedDepartmentsForDivision(
      selectedDivisionId,
      divisions,
      departments,
      divisionDeptMap,
      user
    );
  }

  if (workspaceScope?.departments && workspaceScope.departments.length > 0) {
    const allow = new Set(workspaceScope.departments.map(refId));
    pool = pool.filter((d) => allow.has(String(d._id)));
  }

  return pool.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
}
