export type OdStatusBucket = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'other';

export type OdSegmentId = 'co' | 'hours' | 'regular';

export type OdAuditStatsRecord = {
  _id: string;
  emp_no: string;
  employeeId?: {
    employee_name?: string;
    emp_no?: string;
    department_id?: { name?: string };
    division_id?: { name?: string };
    department?: { name?: string };
    division?: { name?: string };
    designation_id?: { name?: string };
  };
  division_id?: { name?: string } | string;
  division_name?: string;
  department?: { name?: string } | string;
  department_id?: { name?: string } | string;
  department_name?: string;
  odType?: string;
  odType_extended?: 'full_day' | 'half_day' | 'hours' | null;
  fromDate?: string;
  toDate?: string;
  numberOfDays?: number;
  isHalfDay?: boolean;
  halfDayType?: string | null;
  odStartTime?: string | null;
  odEndTime?: string | null;
  durationHours?: number | null;
  purpose?: string;
  placeVisited?: string;
  status?: string;
  isCOEligible?: boolean;
  isAssigned?: boolean;
  workflow?: {
    approvalChain?: Array<{
      label?: string;
      role?: string;
      status?: string;
      actionByName?: string;
    }>;
  };
  createdAt?: string;
};

const PENDING_STATUSES = new Set([
  'draft',
  'pending',
  'reporting_manager_approved',
  'hod_approved',
  'manager_approved',
  'hr_approved',
]);

const REJECTED_STATUSES = new Set([
  'rejected',
  'reporting_manager_rejected',
  'hod_rejected',
  'manager_rejected',
  'hr_rejected',
]);

export function odSegmentOf(od: OdAuditStatsRecord): OdSegmentId {
  if (od.isCOEligible) return 'co';
  if (od.odType_extended === 'hours') return 'hours';
  return 'regular';
}

export function odStatusBucket(status?: string): OdStatusBucket {
  const s = status || '';
  if (PENDING_STATUSES.has(s)) return 'pending';
  if (s === 'approved') return 'approved';
  if (REJECTED_STATUSES.has(s)) return 'rejected';
  if (s === 'cancelled') return 'cancelled';
  return 'other';
}

export type OdStatusBreakdown = {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  other: number;
};

export type OdSegmentBreakdown = {
  co: number;
  hours: number;
  regular: number;
};

export type OdUserPendingRow = {
  key: string;
  empNo: string;
  empName: string;
  department: string;
  co: number;
  hours: number;
  regular: number;
  total: number;
  records: OdAuditStatsRecord[];
};

export function buildOdStatusBreakdown(records: OdAuditStatsRecord[]): OdStatusBreakdown {
  const out: OdStatusBreakdown = { pending: 0, approved: 0, rejected: 0, cancelled: 0, other: 0 };
  for (const od of records) {
    out[odStatusBucket(od.status)] += 1;
  }
  return out;
}

export function buildOdSegmentBreakdown(records: OdAuditStatsRecord[]): OdSegmentBreakdown {
  const out: OdSegmentBreakdown = { co: 0, hours: 0, regular: 0 };
  for (const od of records) {
    out[odSegmentOf(od)] += 1;
  }
  return out;
}

export function buildOdPendingByUser(records: OdAuditStatsRecord[]): OdUserPendingRow[] {
  const pending = records.filter((od) => odStatusBucket(od.status) === 'pending');
  const byKey = new Map<string, OdUserPendingRow>();

  for (const od of pending) {
    const emp = od.employeeId;
    const empNo = emp?.emp_no || od.emp_no;
    const empName = emp?.employee_name || empNo;
    const key = empNo;
    const seg = odSegmentOf(od);

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        empNo,
        empName,
        department: emp?.department_id?.name || '—',
        co: 0,
        hours: 0,
        regular: 0,
        total: 0,
        records: [],
      });
    }
    const row = byKey.get(key)!;
    row[seg] += 1;
    row.total += 1;
    row.records.push(od);
  }

  return Array.from(byKey.values()).sort((a, b) => b.total - a.total || a.empName.localeCompare(b.empName));
}

export const OD_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  reporting_manager_approved: 'RM Approved',
  reporting_manager_rejected: 'RM Rejected',
  hod_approved: 'HOD Approved',
  hod_rejected: 'HOD Rejected',
  manager_approved: 'Mgr Approved',
  manager_rejected: 'Mgr Rejected',
  hr_approved: 'HR Approved',
  hr_rejected: 'HR Rejected',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const UNASSIGNED = 'Unassigned';

function populatedName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const n = String((value as { name?: string }).name || '').trim();
    return n || null;
  }
  return null;
}

export function resolveOdDivisionName(od: OdAuditStatsRecord): string {
  return (
    od.division_name?.trim() ||
    populatedName(od.division_id) ||
    od.employeeId?.division_id?.name?.trim() ||
    od.employeeId?.division?.name?.trim() ||
    UNASSIGNED
  );
}

export function resolveOdDepartmentName(od: OdAuditStatsRecord): string {
  return (
    od.department_name?.trim() ||
    populatedName(od.department) ||
    populatedName(od.department_id) ||
    od.employeeId?.department_id?.name?.trim() ||
    od.employeeId?.department?.name?.trim() ||
    UNASSIGNED
  );
}

export type OdOrgAggregateRow = {
  key: string;
  name: string;
  division?: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  other: number;
  co: number;
  hours: number;
  regular: number;
};

export type OdTrendPoint = {
  label: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
};

function bumpOrgRow(row: OdOrgAggregateRow, od: OdAuditStatsRecord) {
  row.total += 1;
  row[odStatusBucket(od.status)] += 1;
  row[odSegmentOf(od)] += 1;
}

function emptyOrgRow(key: string, name: string, division?: string): OdOrgAggregateRow {
  return {
    key,
    name,
    division,
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    other: 0,
    co: 0,
    hours: 0,
    regular: 0,
  };
}

export function buildOdDivisionAggregates(records: OdAuditStatsRecord[]): OdOrgAggregateRow[] {
  const map = new Map<string, OdOrgAggregateRow>();
  for (const od of records) {
    const name = resolveOdDivisionName(od);
    const key = name;
    if (!map.has(key)) map.set(key, emptyOrgRow(key, name));
    bumpOrgRow(map.get(key)!, od);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function buildOdDepartmentAggregates(records: OdAuditStatsRecord[]): OdOrgAggregateRow[] {
  const map = new Map<string, OdOrgAggregateRow>();
  for (const od of records) {
    const division = resolveOdDivisionName(od);
    const name = resolveOdDepartmentName(od);
    const key = `${division}::${name}`;
    if (!map.has(key)) map.set(key, emptyOrgRow(key, name, division));
    bumpOrgRow(map.get(key)!, od);
  }
  return Array.from(map.values()).sort(
    (a, b) => b.total - a.total || (a.division || '').localeCompare(b.division || '') || a.name.localeCompare(b.name)
  );
}

export function buildOdDepartmentsForDivision(
  records: OdAuditStatsRecord[],
  divisionName: string
): OdOrgAggregateRow[] {
  const filtered = records.filter((od) => resolveOdDivisionName(od) === divisionName);
  return buildOdDepartmentAggregates(filtered);
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortLabel(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function buildOdTrend(
  records: OdAuditStatsRecord[],
  periodFrom: string,
  periodTo: string
): OdTrendPoint[] {
  if (!periodFrom || !periodTo) return [];
  const start = parseYmd(periodFrom);
  const end = parseYmd(periodTo);
  const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const byWeek = daySpan > 35;

  const buckets = new Map<string, OdTrendPoint>();

  const ensure = (key: string, label: string) => {
    if (!buckets.has(key)) {
      buckets.set(key, { label, total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
    }
    return buckets.get(key)!;
  };

  if (byWeek) {
    let cursor = new Date(start);
    while (cursor <= end) {
      const weekStart = new Date(cursor);
      const key = formatYmd(weekStart);
      ensure(key, formatShortLabel(weekStart));
      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = formatYmd(cursor);
      ensure(key, formatShortLabel(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const od of records) {
    const raw = od.fromDate || od.createdAt;
    if (!raw) continue;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) continue;
    let key: string;
    let label: string;
    if (byWeek) {
      const diffDays = Math.floor((dt.getTime() - start.getTime()) / 86400000);
      const weekIndex = Math.max(0, Math.floor(diffDays / 7));
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() + weekIndex * 7);
      key = formatYmd(weekStart);
      label = formatShortLabel(weekStart);
    } else {
      key = formatYmd(dt);
      label = formatShortLabel(dt);
    }
    const row = ensure(key, label);
    row.total += 1;
    const bucket = odStatusBucket(od.status);
    if (bucket === 'pending') row.pending += 1;
    else if (bucket === 'approved') row.approved += 1;
    else if (bucket === 'rejected') row.rejected += 1;
    else if (bucket === 'cancelled') row.cancelled += 1;
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function buildDivisionStatusPercentRows(rows: OdOrgAggregateRow[]) {
  return rows.slice(0, 10).map((r) => {
    const t = r.total || 1;
    return {
      name: r.name.length > 14 ? `${r.name.slice(0, 12)}…` : r.name,
      fullName: r.name,
      pending: pct(r.pending, t),
      approved: pct(r.approved, t),
      rejected: pct(r.rejected, t),
      cancelled: pct(r.cancelled, t),
      total: r.total,
    };
  });
}

export type OdUserWiseStatusCounts = {
  co: number;
  hours: number;
  regular: number;
  total: number;
};

export type OdUserWiseRow = {
  key: string;
  empNo: string;
  empName: string;
  department: string;
  approved: OdUserWiseStatusCounts;
  rejected: OdUserWiseStatusCounts;
  pending: OdUserWiseStatusCounts;
  total: number;
  records: OdAuditStatsRecord[];
};

export function buildOdUserWise(records: OdAuditStatsRecord[]): OdUserWiseRow[] {
  const byKey = new Map<string, OdUserWiseRow>();

  for (const od of records) {
    const emp = od.employeeId;
    const empNo = emp?.emp_no || od.emp_no;
    const empName = emp?.employee_name || empNo;
    const key = empNo;
    const seg = odSegmentOf(od);
    const bucket = odStatusBucket(od.status);

    if (bucket !== 'pending' && bucket !== 'approved' && bucket !== 'rejected') {
      continue;
    }

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        empNo,
        empName,
        department: emp?.department_id?.name || '—',
        approved: { co: 0, hours: 0, regular: 0, total: 0 },
        rejected: { co: 0, hours: 0, regular: 0, total: 0 },
        pending: { co: 0, hours: 0, regular: 0, total: 0 },
        total: 0,
        records: [],
      });
    }

    const row = byKey.get(key)!;
    row[bucket][seg] += 1;
    row[bucket].total += 1;
    row.total += 1;
    row.records.push(od);
  }

  return Array.from(byKey.values()).sort((a, b) => b.total - a.total || a.empName.localeCompare(b.empName));
}

