import { RosterCell, RosterState } from './types';

/** Weekday 0–6 (Sun–Sat) → cell template from one reference employee row */
export type WeekdayPattern = Record<number, RosterCell | undefined>;

export type DeptRosterTemplate = {
  id: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  pattern: WeekdayPattern;
  createdAt: string;
};

const TEMPLATE_STORAGE_KEY = 'hrms_roster_dept_templates';

export function cloneCell(cell?: RosterCell): RosterCell {
  if (!cell) return { shiftId: null, status: undefined };
  return {
    shiftId: cell.shiftId ?? null,
    status: cell.status,
  };
}

export function buildWeekdayPatternFromRow(
  row: Record<string, RosterCell>,
  days: string[]
): WeekdayPattern {
  const pattern: WeekdayPattern = {};
  days.forEach((d) => {
    const wd = new Date(d).getDay();
    if (row[d] && (row[d].shiftId || row[d].status)) {
      pattern[wd] = cloneCell(row[d]);
    }
  });
  return pattern;
}

export function applyWeekdayPatternToDays(
  pattern: WeekdayPattern,
  days: string[],
  dojStr: string | null
): Record<string, RosterCell> {
  const updates: Record<string, RosterCell> = {};
  days.forEach((d) => {
    if (dojStr && d < dojStr) return;
    const wd = new Date(d).getDay();
    const template = pattern[wd];
    if (template && (template.shiftId || template.status)) {
      updates[d] = cloneCell(template);
    }
  });
  return updates;
}

export function getSameWeekDaysAfter(sourceDate: string, allDays: string[]): string[] {
  const src = new Date(sourceDate);
  const srcWeek = getWeekKey(src);
  return allDays.filter((d) => {
    if (d < sourceDate) return false;
    return getWeekKey(new Date(d)) === srcWeek;
  });
}

function getWeekKey(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day;
  const start = new Date(d);
  start.setDate(diff);
  return `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`;
}

export function copyRowToTargets(
  roster: RosterState,
  sourceEmpNo: string,
  targetEmpNos: string[],
  days: string[],
  getDoj: (empNo: string) => string | null
): { empNo: string; date: string; cell: RosterCell }[] {
  const sourceRow = roster.get(sourceEmpNo) || {};
  const updates: { empNo: string; date: string; cell: RosterCell }[] = [];

  targetEmpNos.forEach((target) => {
    if (target === sourceEmpNo) return;
    const dojStr = getDoj(target);
    days.forEach((d) => {
      if (dojStr && d < dojStr) return;
      const cell = sourceRow[d];
      if (cell && (cell.shiftId || cell.status)) {
        updates.push({ empNo: target, date: d, cell: cloneCell(cell) });
      }
    });
  });

  return updates;
}

export function buildPreviousCycleWeekdayMap(
  entries: { employeeNumber: string; date: string; shiftId?: string | null; status?: string }[]
): Map<string, RosterCell> {
  const map = new Map<string, RosterCell>();
  entries.forEach((e) => {
    if (!e.employeeNumber || !e.date) return;
    if (e.status === 'HOL') return;
    const empNo = e.employeeNumber.toUpperCase();
    const wd = new Date(e.date).getDay();
    const key = `${empNo}|${wd}`;
    if (!map.has(key)) {
      map.set(key, {
        shiftId: e.shiftId || null,
        status: e.status === 'WO' ? 'WO' : e.status === 'HOL' ? 'HOL' : undefined,
      });
    }
  });
  return map;
}

export function fillFromPreviousCycleForEmployees(
  employees: { emp_no: string; doj?: string }[],
  days: string[],
  prevMap: Map<string, RosterCell>,
  parseDoj: (doj?: string) => string | null
): { empNo: string; date: string; cell: RosterCell }[] {
  const updates: { empNo: string; date: string; cell: RosterCell }[] = [];
  employees.forEach((emp) => {
    const empNo = emp.emp_no.toUpperCase();
    const dojStr = parseDoj(emp.doj);
    days.forEach((d) => {
      if (dojStr && d < dojStr) return;
      const wd = new Date(d).getDay();
      const template = prevMap.get(`${empNo}|${wd}`);
      if (template && (template.shiftId || template.status)) {
        updates.push({ empNo: emp.emp_no, date: d, cell: cloneCell(template) });
      }
    });
  });
  return updates;
}

export function loadDeptTemplates(): DeptRosterTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeptRosterTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeptTemplates(templates: DeptRosterTemplate[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

export function navigateMonthStr(current: string, direction: 'prev' | 'next'): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + (direction === 'next' ? 1 : -1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
