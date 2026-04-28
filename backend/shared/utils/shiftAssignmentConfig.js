/**
 * Normalize shift assignment payloads: expand employee_group_ids[] into
 * one stored config per group (same storage shape as a single group today).
 *
 * @param {Array<string|object>} shifts
 * @returns {Array<{ shiftId: unknown, gender: string, employee_group_id: unknown|null }>}
 */
function flattenShiftConfigsWithGroups(shifts) {
    const out = [];
    if (!Array.isArray(shifts)) {
        return out;
    }
    for (const s of shifts) {
        if (typeof s === 'string') {
            out.push({ shiftId: s, gender: 'All', employee_group_id: null });
            continue;
        }
        if (!s || !s.shiftId) continue;
        const shiftId = s.shiftId;
        const gender = s.gender || 'All';
        const ids = Array.isArray(s.employee_group_ids) ? s.employee_group_ids : null;

        if (ids && ids.some((id) => id !== undefined && id !== null && id !== '')) {
            const seen = new Set();
            for (const id of ids) {
                if (id === undefined || id === null || id === '') continue;
                const str = String(id);
                if (seen.has(str)) continue;
                seen.add(str);
                out.push({ shiftId, gender, employee_group_id: str });
            }
        } else {
            const single =
                s.employee_group_id === undefined || s.employee_group_id === null || s.employee_group_id === ''
                    ? null
                    : s.employee_group_id;
            out.push({ shiftId, gender, employee_group_id: single });
        }
    }
    return out;
}

module.exports = { flattenShiftConfigsWithGroups };
