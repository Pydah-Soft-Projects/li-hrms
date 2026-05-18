import { format, parseISO } from 'date-fns';
import { Holiday, Employee, HolidayGroup, Shift } from '@/lib/api';
import { RosterCell, RosterListQuery, RosterState } from './types';

export function checkGroupApplicability(holiday: Holiday, emp: Employee, groups: HolidayGroup[]) {
  const targetGroups: HolidayGroup[] = [];

  if (holiday.scope === 'GROUP') {
    const gId = (holiday.groupId && typeof holiday.groupId === 'object') ? (holiday.groupId as { _id: string })._id : holiday.groupId;
    const g = groups.find(grp => grp._id === gId);
    if (g) targetGroups.push(g);
  } else if (holiday.targetGroupIds && holiday.targetGroupIds.length > 0) {
    holiday.targetGroupIds.forEach(tg => {
      const gId = (tg && typeof tg === 'object') ? (tg as { _id: string })._id : tg;
      const g = groups.find(grp => grp._id === gId);
      if (g) targetGroups.push(g);
    });
  }

  if (targetGroups.length === 0) return false;

  return targetGroups.some(g => {
    if (!g.divisionMapping) return false;
    return g.divisionMapping.some(m => {
      const divId = (m.division && typeof m.division === 'object') ? (m.division as { _id: string })._id : m.division;
      const empDivId = (emp.division && typeof emp.division === 'object') ? (emp.division as any)._id : emp.division;

      if (divId === empDivId) {
        if (!m.departments || m.departments.length === 0) return true;
        const empDeptId = (emp.department && typeof emp.department === 'object') ? (emp.department as any)._id : emp.department;
        return m.departments.some(d => {
          const dId = (d && typeof d === 'object') ? (d as { _id: string })._id : d;
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

export function formatSimpleDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDaysInRange(startDate: Date, endDate: Date) {
  const days: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    days.push(formatSimpleDate(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export function shiftLabel(shift?: Shift | null) {
  if (!shift) return '';
  if (shift.code) return shift.code;
  return shift.name || '';
}

export function navigateMonth(current: string, direction: 'prev' | 'next'): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + (direction === 'next' ? 1 : -1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildEmployeeListParams(q: RosterListQuery): Record<string, unknown> {
  const empParams: Record<string, unknown> = { page: q.page, limit: q.limit };
  if (q.selectedDept) empParams.department_id = q.selectedDept;
  if (q.selectedDivision) empParams.division_id = q.selectedDivision;
  if (q.selectedDesignation) empParams.designation_id = q.selectedDesignation;
  if (q.selectedGroup) empParams.employee_group_id = q.selectedGroup;
  if (q.searchQuery) empParams.search = q.searchQuery;
  if (q.cycleDates?.startDate && q.cycleDates?.endDate) {
    empParams.startDate = q.cycleDates.startDate;
    empParams.endDate = q.cycleDates.endDate;
  }
  return empParams;
}

export function buildRosterApiParams(q: RosterListQuery, opts?: { paginate?: boolean }) {
  const paginate = opts?.paginate !== false;
  return {
    departmentId: q.selectedDept || undefined,
    divisionId: q.selectedDivision || undefined,
    designationId: q.selectedDesignation || undefined,
    employeeGroupId: q.selectedGroup || undefined,
    search: q.searchQuery || undefined,
    startDate: q.cycleDates?.startDate,
    endDate: q.cycleDates?.endDate,
    ...(paginate ? { page: q.page, limit: q.limit } : {}),
  };
}

export function parseRosterEntries(
  entries: { employeeNumber: string; date: string; shiftId?: string | null; status?: string }[]
): RosterState {
  const map = new Map<string, Record<string, RosterCell>>();
  entries.forEach((e) => {
    if (!e.employeeNumber) return;
    if (!map.has(e.employeeNumber)) map.set(e.employeeNumber, {});
    map.get(e.employeeNumber)![e.date] = {
      shiftId: e.shiftId || null,
      status: e.status === 'WO' ? 'WO' : (e.status === 'HOL' ? 'HOL' : undefined),
    };
  });
  return map;
}