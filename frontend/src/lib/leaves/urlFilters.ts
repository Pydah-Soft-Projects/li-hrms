export type LeavesPageTab = 'leaves' | 'od' | 'pending' | 'in_progress';
export type LeavesPendingTab = 'leaves' | 'od';

export type LeavesUrlFilters = {
  tab?: LeavesPageTab;
  pending?: LeavesPendingTab;
  from?: string;
  to?: string;
  division?: string;
  dept?: string;
  designation?: string;
  q?: string;
  leaveStatus?: string;
  odStatus?: string;
  odPlace?: string;
  leaveType?: string;
  odType?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_TABS: LeavesPageTab[] = ['leaves', 'od', 'pending', 'in_progress'];
const VALID_PENDING: LeavesPendingTab[] = ['leaves', 'od'];

export function splitUrlIdList(value?: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinUrlIdList(ids: string[]): string | undefined {
  if (!ids.length) return undefined;
  return ids.join(',');
}

export function parseLeavesUrlFilters(searchParams: URLSearchParams): LeavesUrlFilters {
  const out: LeavesUrlFilters = {};

  const tab = searchParams.get('tab')?.trim() as LeavesPageTab | undefined;
  if (tab && VALID_TABS.includes(tab) && tab !== 'leaves') out.tab = tab;

  const pending = searchParams.get('pending')?.trim() as LeavesPendingTab | undefined;
  if (pending && VALID_PENDING.includes(pending) && pending !== 'leaves') {
    out.pending = pending;
  }

  const from = searchParams.get('from')?.trim();
  const to = searchParams.get('to')?.trim();
  if (from && DATE_RE.test(from)) out.from = from;
  if (to && DATE_RE.test(to)) out.to = to;

  const division = searchParams.get('division')?.trim();
  if (division) out.division = division;

  const dept = searchParams.get('dept')?.trim();
  if (dept) out.dept = dept;

  const designation = searchParams.get('designation')?.trim();
  if (designation) out.designation = designation;

  const q = searchParams.get('q')?.trim();
  if (q) out.q = q;

  const leaveStatus = searchParams.get('leaveStatus')?.trim();
  if (leaveStatus) out.leaveStatus = leaveStatus;

  const odStatus = searchParams.get('odStatus')?.trim();
  if (odStatus) out.odStatus = odStatus;

  const odPlace = searchParams.get('odPlace')?.trim();
  if (odPlace) out.odPlace = odPlace;

  const leaveType = searchParams.get('leaveType')?.trim();
  if (leaveType) out.leaveType = leaveType;

  const odType = searchParams.get('odType')?.trim();
  if (odType) out.odType = odType;

  return out;
}

export function buildLeavesSearchParams(filters: LeavesUrlFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tab && filters.tab !== 'leaves') params.set('tab', filters.tab);
  if (filters.pending && filters.pending !== 'leaves' && filters.tab === 'pending') {
    params.set('pending', filters.pending);
  }
  if (filters.from && DATE_RE.test(filters.from)) params.set('from', filters.from);
  if (filters.to && DATE_RE.test(filters.to)) params.set('to', filters.to);
  if (filters.division) params.set('division', filters.division);
  if (filters.dept) params.set('dept', filters.dept);
  if (filters.designation) params.set('designation', filters.designation);
  if (filters.q) params.set('q', filters.q);
  if (filters.leaveStatus) params.set('leaveStatus', filters.leaveStatus);
  if (filters.odStatus) params.set('odStatus', filters.odStatus);
  if (filters.odPlace) params.set('odPlace', filters.odPlace);
  if (filters.leaveType) params.set('leaveType', filters.leaveType);
  if (filters.odType) params.set('odType', filters.odType);
  return params;
}

/** Build filter object for URL sync from page state. */
export function leavesStateToUrlFilters(input: {
  activeTab: LeavesPageTab;
  pendingTab: LeavesPendingTab;
  dateRange: { from: string; to: string };
  divisionIds: string[];
  departmentIds: string[];
  designationIds: string[];
  search?: string;
  leaveStatus?: string;
  odStatus?: string;
  odPlace?: string;
  leaveType?: string;
  odType?: string;
}): LeavesUrlFilters {
  return {
    tab: input.activeTab !== 'leaves' ? input.activeTab : undefined,
    pending:
      input.activeTab === 'pending' && input.pendingTab !== 'leaves'
        ? input.pendingTab
        : undefined,
    from: input.dateRange.from || undefined,
    to: input.dateRange.to || undefined,
    division: joinUrlIdList(input.divisionIds),
    dept: joinUrlIdList(input.departmentIds),
    designation: joinUrlIdList(input.designationIds),
    q: input.search?.trim() || undefined,
    leaveStatus: input.leaveStatus || undefined,
    odStatus: input.odStatus || undefined,
    odPlace: input.odPlace || undefined,
    leaveType: input.leaveType || undefined,
    odType: input.odType || undefined,
  };
}
