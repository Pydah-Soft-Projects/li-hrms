import { format, parseISO } from 'date-fns';
import { Holiday, Employee, HolidayGroup, Shift } from '@/lib/api';

export function checkGroupApplicability(holiday: Holiday, emp: Employee, groups: HolidayGroup[]) {
    const targetGroups: HolidayGroup[] = [];

    if (holiday.scope === 'GROUP') {
        const gId = typeof holiday.groupId === 'object' ? (holiday.groupId as { _id: string })._id : holiday.groupId;
        const g = groups.find(grp => grp._id === gId);
        if (g) targetGroups.push(g);
    } else if (holiday.targetGroupIds && holiday.targetGroupIds.length > 0) {
        holiday.targetGroupIds.forEach(tg => {
            const gId = typeof tg === 'object' ? (tg as { _id: string })._id : tg;
            const g = groups.find(grp => grp._id === gId);
            if (g) targetGroups.push(g);
        });
    }

    return targetGroups.some(g => {
        return g.divisionMapping.some(m => {
            const divId = typeof m.division === 'object' ? (m.division as { _id: string })._id : m.division;
            const empDivId = typeof emp.division === 'object' ? (emp.division as any)._id : emp.division;

            if (divId === empDivId) {
                if (!m.departments || m.departments.length === 0) {
                    return true;
                }
                const empDeptId = typeof emp.department === 'object' ? (emp.department as any)._id : emp.department;
                return m.departments.some(d => {
                    const dId = typeof d === 'object' ? (d as { _id: string })._id : d;
                    return dId === empDeptId;
                });
            }
            return false;
        });
    });
}

export function formatMonthInput(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthDays(monthStr: string) {
    const [y, m] = monthStr.split('-').map(Number);
    const days: string[] = [];
    const end = new Date(y, m, 0).getDate();
    for (let d = 1; d <= end; d++) {
        days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
}

export function shiftLabel(shift?: Shift | null) {
    if (!shift) return '';
    if (shift.code) return shift.code;
    return shift.name || '';
}
