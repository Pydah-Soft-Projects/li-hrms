export type ShiftRosterUrlFilters = {
  month?: string;
  division?: string;
  dept?: string;
  designation?: string;
  group?: string;
  q?: string;
  page?: number;
  tab?: 'roster' | 'assigned';
};

const MONTH_RE = /^\d{4}-\d{2}$/;

export function parseShiftRosterUrlFilters(searchParams: URLSearchParams): ShiftRosterUrlFilters {
  const out: ShiftRosterUrlFilters = {};
  const month = searchParams.get('month')?.trim();
  if (month && MONTH_RE.test(month)) out.month = month;

  const division = searchParams.get('division')?.trim();
  if (division) out.division = division;

  const dept = searchParams.get('dept')?.trim();
  if (dept) out.dept = dept;

  const designation = searchParams.get('designation')?.trim();
  if (designation) out.designation = designation;

  const group = searchParams.get('group')?.trim();
  if (group) out.group = group;

  const q = searchParams.get('q')?.trim();
  if (q) out.q = q;

  const pageRaw = searchParams.get('page');
  if (pageRaw) {
    const page = parseInt(pageRaw, 10);
    if (Number.isFinite(page) && page > 1) out.page = page;
  }

  const tab = searchParams.get('tab')?.trim();
  if (tab === 'assigned') out.tab = 'assigned';

  return out;
}

export function buildShiftRosterSearchParams(filters: ShiftRosterUrlFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.month && MONTH_RE.test(filters.month)) params.set('month', filters.month);
  if (filters.division) params.set('division', filters.division);
  if (filters.dept) params.set('dept', filters.dept);
  if (filters.designation) params.set('designation', filters.designation);
  if (filters.group) params.set('group', filters.group);
  if (filters.q) params.set('q', filters.q);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.tab === 'assigned') params.set('tab', 'assigned');
  return params;
}
