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
