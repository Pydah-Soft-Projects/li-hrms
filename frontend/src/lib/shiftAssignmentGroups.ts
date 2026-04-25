/** One selected shift row in division / department / designation assignment UI */
export type DivisionShiftSelectionRow = {
    shiftId: string;
    gender: string;
    /** Empty = all employee groups (stored as null employee_group_id). */
    employee_group_ids: string[];
};

type FlatShiftRow = {
    shiftId: string;
    gender?: string;
    employee_group_id?: string | null;
};

/**
 * Merge stored shift configs (one row per group) into editor rows (one row per shift).
 */
export function collapseShiftRowsForEditor(rows: FlatShiftRow[]): DivisionShiftSelectionRow[] {
    const byShift = new Map<
        string,
        { shiftId: string; genders: Set<string>; groups: Set<string>; hasAll: boolean }
    >();
    for (const raw of rows || []) {
        if (!raw?.shiftId) continue;
        const shiftId = String(raw.shiftId);
        const gender = raw.gender || 'All';
        if (!byShift.has(shiftId)) {
            byShift.set(shiftId, { shiftId, genders: new Set(), groups: new Set(), hasAll: false });
        }
        const cell = byShift.get(shiftId)!;
        cell.genders.add(gender);
        if (!raw.employee_group_id) cell.hasAll = true;
        else cell.groups.add(String(raw.employee_group_id));
    }
    return Array.from(byShift.values()).map((cell) => ({
        shiftId: cell.shiftId,
        gender: cell.genders.size === 1 ? [...cell.genders][0] : 'All',
        employee_group_ids: cell.hasAll ? [] : Array.from(cell.groups),
    }));
}

/**
 * Expand editor rows to API payload (one object per group for multi-select).
 */
export function expandShiftRowsForApi(rows: DivisionShiftSelectionRow[]) {
    return rows.flatMap((row) => {
        const gender = row.gender || 'All';
        if (!row.employee_group_ids?.length) {
            return [{ shiftId: row.shiftId, gender, employee_group_id: null as string | null }];
        }
        return row.employee_group_ids.map((gid) => ({
            shiftId: row.shiftId,
            gender,
            employee_group_id: gid,
        }));
    });
}
