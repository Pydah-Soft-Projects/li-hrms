import type { Department, Division } from '@/lib/api';

function divisionRefId(ref: string | Division): string {
    return String(typeof ref === 'string' ? ref : ref._id);
}

function departmentRefId(ref: string | Department): string {
    return String(typeof ref === 'string' ? ref : ref._id);
}

function isPopulatedDepartment(ref: unknown): ref is Department {
    return typeof ref === 'object' && ref != null && '_id' in ref && 'name' in ref;
}

/**
 * Builds division → department ID links from both `Division.departments` and `Department.divisions`.
 * IDs from `Division.departments` are always included (even when missing from the departments list).
 */
export function buildDivisionToDepartmentIdsMap(
    divisions: Division[],
    departments: Department[]
): Map<string, Set<string>> {
    const divToDeptIds = new Map<string, Set<string>>();

    for (const div of divisions) {
        const divId = String(div._id);
        if (!divToDeptIds.has(divId)) divToDeptIds.set(divId, new Set());
        for (const ref of div.departments || []) {
            divToDeptIds.get(divId)!.add(departmentRefId(ref));
        }
    }

    for (const dept of departments) {
        const deptId = String(dept._id);
        for (const ref of dept.divisions || []) {
            const divId = divisionRefId(ref);
            if (!divToDeptIds.has(divId)) divToDeptIds.set(divId, new Set());
            divToDeptIds.get(divId)!.add(deptId);
        }
    }

    return divToDeptIds;
}

/**
 * Departments for a division — same sources as employee filters and holiday mapping:
 * 1) division.departments on the division record (primary, like filter dropdowns)
 * 2) department.divisions links
 * 3) bidirectional link map fallback
 */
export function filterDepartmentsForDivision(
    divisionId: string,
    divisions: Division[],
    departments: Department[],
    map?: Map<string, Set<string>>
): Department[] {
    if (!divisionId) return [];
    const divId = String(divisionId);
    const seen = new Set<string>();
    const list: Department[] = [];

    const add = (dept: Department) => {
        const id = String(dept._id);
        if (!seen.has(id)) {
            seen.add(id);
            list.push(dept);
        }
    };

    const div = divisions.find((d) => String(d._id) === divId);
    for (const ref of div?.departments || []) {
        const id = departmentRefId(ref);
        if (isPopulatedDepartment(ref)) {
            add(ref);
        } else {
            const row = departments.find((d) => String(d._id) === id);
            if (row) add(row);
        }
    }

    for (const dept of departments) {
        for (const ref of dept.divisions || []) {
            if (divisionRefId(ref) === divId) add(dept);
        }
    }

    const linkMap = map ?? buildDivisionToDepartmentIdsMap(divisions, departments);
    for (const id of linkMap.get(divId) || []) {
        const row = departments.find((d) => String(d._id) === id);
        if (row) add(row);
    }

    return list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}

/** Departments linked to a division (both link directions + populated division.departments). */
export function getDepartmentsForDivision(
    divisionId: string,
    divisions: Division[],
    departments: Department[],
    map?: Map<string, Set<string>>
): Department[] {
    const divId = String(divisionId);
    const linkMap = map ?? buildDivisionToDepartmentIdsMap(divisions, departments);
    const ids = new Set(linkMap.get(divId) || []);

    const div = divisions.find((d) => String(d._id) === divId);
    const populatedFromDivision = new Map<string, Department>();
    for (const ref of div?.departments || []) {
        const id = departmentRefId(ref);
        ids.add(id);
        if (isPopulatedDepartment(ref)) {
            populatedFromDivision.set(id, ref);
        }
    }

    const deptById = new Map(departments.map((d) => [String(d._id), d]));
    const list: Department[] = [];
    for (const id of ids) {
        const row = deptById.get(id) ?? populatedFromDivision.get(id);
        if (row) list.push(row);
    }

    return list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}

/** Normalize divisionMapping entries to string IDs for form state. */
export function normalizeDivisionMapping(
    mapping: { division: string | Division; departments?: (string | Department)[] }[] | undefined
): { division: string; departments: string[] }[] {
    return (mapping || []).map((m) => ({
        division: divisionRefId(m.division),
        departments: (m.departments || []).map((d) => departmentRefId(d)).filter(Boolean),
    }));
}

/** Whether a mapping's department list includes a department ID (string or populated). */
export function mappingIncludesDepartment(
    departments: (string | Department)[] | undefined,
    deptId: string
): boolean {
    const want = String(deptId);
    return (departments || []).some((d) => departmentRefId(d) === want);
}

/**
 * Departments to show under a division in mapping UIs: linked depts plus any already
 * assigned on the user (so edit/create reflects saved mapping even when scope-filtered).
 */
export function getDepartmentsForDivisionDisplay(
    divisionId: string,
    divisions: Division[],
    departments: Department[],
    mappedDepartmentRefs?: (string | Department)[],
    map?: Map<string, Set<string>>
): Department[] {
    const list = getDepartmentsForDivision(divisionId, divisions, departments, map);
    const seen = new Set(list.map((d) => String(d._id)));

    for (const ref of mappedDepartmentRefs || []) {
        const id = departmentRefId(ref);
        if (!id || seen.has(id)) continue;
        const row = departments.find((d) => String(d._id) === id);
        if (row) {
            list.push(row);
            seen.add(id);
        } else if (isPopulatedDepartment(ref)) {
            list.push(ref);
            seen.add(id);
        }
    }

    return list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}

/** Build initial divisionMapping from an employee's department. */
export function buildDivisionMappingFromDepartment(
    departmentId: string | undefined,
    divisions: Division[],
    departments: Department[]
): { division: string; departments: string[] }[] {
    if (!departmentId) return [];
    const deptId = String(departmentId);
    const divId = findDivisionIdForDepartment(deptId, divisions, departments);
    if (!divId) return [];
    return [{ division: divId, departments: [deptId] }];
}

/** First division linked to a department (checks both directions). */
export function findDivisionIdForDepartment(
    departmentId: string,
    divisions: Division[],
    departments: Department[]
): string {
    const want = String(departmentId);
    const dept = departments.find((d) => String(d._id) === want);
    for (const ref of dept?.divisions || []) {
        const divId = divisionRefId(ref);
        if (divId) return divId;
    }
    const div = divisions.find((d) =>
        (d.departments || []).some((dep) => departmentRefId(dep) === want)
    );
    return div ? String(div._id) : '';
}
