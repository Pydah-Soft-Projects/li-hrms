import type { EmployeeGroup } from '@/lib/api';

function groupIdFromRef(ref: unknown): string {
    if (ref == null) return '';
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'object' && ref !== null && '_id' in ref) {
        return String((ref as { _id: string })._id);
    }
    return '';
}

/** When set, only these group IDs are allowed (user `groupMapping` / group data scope). */
export function getUserAllowedEmployeeGroupIds(user: {
    role?: string;
    dataScope?: string;
    groupMapping?: unknown[];
} | null): string[] | null {
    if (!user) return null;
    if (user.role === 'super_admin' || user.dataScope === 'all') return null;

    const scope = (user.dataScope || '').toLowerCase();
    if ((scope === 'group' || scope === 'groups') && Array.isArray(user.groupMapping) && user.groupMapping.length > 0) {
        return user.groupMapping.map((g) => groupIdFromRef(g)).filter(Boolean);
    }
    return null;
}

export function collectEmployeeGroupIdsFromEmployees(employees: unknown[]): Set<string> {
    const ids = new Set<string>();
    for (const emp of employees) {
        if (!emp || typeof emp !== 'object') continue;
        const e = emp as Record<string, unknown>;
        const gid =
            groupIdFromRef(e.employee_group_id) ||
            groupIdFromRef(e.employee_group) ||
            groupIdFromRef((e.employee_group_id as { _id?: string })?._id);
        if (gid) ids.add(gid);
    }
    return ids;
}

/**
 * Employee groups for filter dropdowns: user access + optional division/department context.
 */
export function getScopedEmployeeGroupsForFilter(
    groups: EmployeeGroup[],
    options: {
        divisionId?: string;
        departmentId?: string;
        userAllowedGroupIds?: string[] | null;
        orgScopeGroupIds?: Set<string> | null;
    }
): EmployeeGroup[] {
    let pool = groups;

    if (options.userAllowedGroupIds && options.userAllowedGroupIds.length > 0) {
        const allow = new Set(options.userAllowedGroupIds.map(String));
        pool = pool.filter((g) => allow.has(String(g._id)));
    }

    const divId = options.divisionId ? String(options.divisionId) : '';
    const deptId = options.departmentId ? String(options.departmentId) : '';
    const hasOrgFilter =
        (divId && divId !== 'all') || (deptId && deptId !== 'all');

    if (hasOrgFilter && options.orgScopeGroupIds) {
        if (options.orgScopeGroupIds.size === 0) {
            pool = [];
        } else {
            pool = pool.filter((g) => options.orgScopeGroupIds!.has(String(g._id)));
        }
    }

    return [...pool].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
}
