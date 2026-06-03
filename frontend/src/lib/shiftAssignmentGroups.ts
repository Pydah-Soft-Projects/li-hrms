/** One selected shift row in division / department / designation assignment UI */
export type DivisionShiftSelectionRow = {
    shiftId: string;
    gender: string;
    /** Empty = all employee groups (stored as null employee_group_id). */
    employee_group_ids: string[];
    firstHalf?: {
        startTime?: string | null;
        endTime?: string | null;
        duration?: number | null;
        minDuration?: number | null;
        gracePeriod?: number | null;
        payableShifts?: number | null;
    } | null;
    break?: {
        startTime?: string | null;
        endTime?: string | null;
    } | null;
    secondHalf?: {
        startTime?: string | null;
        endTime?: string | null;
        duration?: number | null;
        minDuration?: number | null;
        gracePeriod?: number | null;
        payableShifts?: number | null;
    } | null;
};

type FlatShiftRow = {
    shiftId: string;
    gender?: string;
    employee_group_id?: string | null;
    firstHalf?: any;
    break?: any;
    secondHalf?: any;
};

/**
 * Merge stored shift configs (one row per group) into editor rows (one row per shift).
 */
export function collapseShiftRowsForEditor(rows: FlatShiftRow[]): DivisionShiftSelectionRow[] {
    const byShift = new Map<
        string,
        {
            shiftId: string;
            genders: Set<string>;
            groups: Set<string>;
            hasAll: boolean;
            firstHalf: any;
            breakSegment: any;
            secondHalf: any;
        }
    >();
    for (const raw of rows || []) {
        if (!raw?.shiftId) continue;
        const shiftId = String(raw.shiftId);
        const gender = raw.gender || 'All';
        if (!byShift.has(shiftId)) {
            byShift.set(shiftId, {
                shiftId,
                genders: new Set(),
                groups: new Set(),
                hasAll: false,
                firstHalf: raw.firstHalf ?? null,
                breakSegment: raw.break ?? null,
                secondHalf: raw.secondHalf ?? null,
            });
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
        firstHalf: cell.firstHalf ?? null,
        break: cell.breakSegment ?? null,
        secondHalf: cell.secondHalf ?? null,
    }));
}

/**
 * Expand editor rows to API payload (one object per group for multi-select).
 */
export function expandShiftRowsForApi(rows: DivisionShiftSelectionRow[]) {
    return rows.flatMap((row) => {
        const gender = row.gender || 'All';
        if (!row.employee_group_ids?.length) {
            return [{
                shiftId: row.shiftId,
                gender,
                employee_group_id: null as string | null,
                firstHalf: row.firstHalf ?? null,
                break: row.break ?? null,
                secondHalf: row.secondHalf ?? null,
            }];
        }
        return row.employee_group_ids.map((gid) => ({
            shiftId: row.shiftId,
            gender,
            employee_group_id: gid,
            firstHalf: row.firstHalf ?? null,
            break: row.break ?? null,
            secondHalf: row.secondHalf ?? null,
        }));
    });
}
