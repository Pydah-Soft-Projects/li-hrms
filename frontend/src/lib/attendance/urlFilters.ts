export type AttendanceTableType =
  | 'complete'
  | 'present_absent'
  | 'in_out'
  | 'leaves'
  | 'od'
  | 'ot';

export type AttendanceUrlFilters = {
  month?: string;
  division?: string;
  dept?: string;
  designation?: string;
  q?: string;
  table?: AttendanceTableType;
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const TABLE_TYPES: AttendanceTableType[] = [
  'complete',
  'present_absent',
  'in_out',
  'leaves',
  'od',
  'ot',
];

export function dateToAttendanceMonth(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Parse YYYY-MM to a Date on the 15th (avoids month-end rollover when navigating). */
export function attendanceMonthToDate(month?: string): Date | null {
  if (!month || !MONTH_RE.test(month)) return null;
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 15);
}

export function parseAttendanceUrlFilters(searchParams: URLSearchParams): AttendanceUrlFilters {
  const out: AttendanceUrlFilters = {};

  const month = searchParams.get('month')?.trim();
  if (month && MONTH_RE.test(month)) out.month = month;

  const division = searchParams.get('division')?.trim();
  if (division) out.division = division;

  const dept = searchParams.get('dept')?.trim();
  if (dept) out.dept = dept;

  const designation = searchParams.get('designation')?.trim();
  if (designation) out.designation = designation;

  const q = searchParams.get('q')?.trim();
  if (q && q.length >= 2) out.q = q;

  const table = searchParams.get('table')?.trim() as AttendanceTableType | undefined;
  if (table && TABLE_TYPES.includes(table) && table !== 'complete') {
    out.table = table;
  }

  return out;
}

export function buildAttendanceSearchParams(filters: AttendanceUrlFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.month && MONTH_RE.test(filters.month)) params.set('month', filters.month);
  if (filters.division) params.set('division', filters.division);
  if (filters.dept) params.set('dept', filters.dept);
  if (filters.designation) params.set('designation', filters.designation);
  if (filters.q && filters.q.length >= 2) params.set('q', filters.q);
  if (filters.table && filters.table !== 'complete') params.set('table', filters.table);
  return params;
}
