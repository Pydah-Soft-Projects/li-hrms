/**
 * Leave vs OD workflow status helpers. OD model excludes principal_*; filters and
 * breakdowns must not surface leave-only statuses for ODs.
 */

export type LeaveOdStatusDef = {
  code: string;
  name?: string;
  sortOrder?: number;
};

const LEAVE_STATUS_ORDER: string[] = [
  'draft',
  'pending',
  'reporting_manager_approved',
  'manager_approved',
  'hod_approved',
  'hr_approved',
  'principal_approved',
  'approved',
  'reporting_manager_rejected',
  'manager_rejected',
  'hod_rejected',
  'hr_rejected',
  'principal_rejected',
  'rejected',
  'cancelled',
];

/** Mirrors `backend/leaves/model/OD.js` status enum — no principal step. */
const OD_STATUS_ORDER: string[] = [
  'draft',
  'pending',
  'reporting_manager_approved',
  'manager_approved',
  'hod_approved',
  'hr_approved',
  'approved',
  'reporting_manager_rejected',
  'manager_rejected',
  'hod_rejected',
  'hr_rejected',
  'rejected',
  'cancelled',
];

export const OD_MODEL_STATUS_CODES = new Set<string>(OD_STATUS_ORDER);

export function buildStatusLabelMap(defs: LeaveOdStatusDef[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  if (!Array.isArray(defs)) return m;
  for (const s of defs) {
    const c = s?.code;
    if (!c) continue;
    const name = s.name != null ? String(s.name).trim() : '';
    m[c] = name || c.replaceAll('_', ' ');
  }
  return m;
}

export function formatLeaveStatusLabel(status: string | undefined, map: Record<string, string>): string {
  if (!status) return 'Unknown';
  return map[status] ?? status.replaceAll('_', ' ');
}

/** OD `draft` is treated as awaiting OUT submission in this product. */
export function formatOdStatusLabel(status: string | undefined, map: Record<string, string>): string {
  if (!status) return 'Unknown';
  if (status === 'draft') return 'Waiting for OUT evidence';
  return map[status] ?? status.replaceAll('_', ' ');
}

export function filterStatusDefsForOd(defs: LeaveOdStatusDef[]): LeaveOdStatusDef[] {
  return (defs || [])
    .filter((d) => d?.code && OD_MODEL_STATUS_CODES.has(d.code))
    .slice();
}

function titleCaseStatusCode(code: string): string {
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildStatusFilterOptions(
  defs: LeaveOdStatusDef[],
  orderedCodes: string[],
  allLabel: string
): { value: string; label: string }[] {
  const base = [{ value: '', label: allLabel }];
  const byCode = new Map<string, LeaveOdStatusDef>();
  for (const d of defs || []) {
    if (d?.code) byCode.set(d.code, d);
  }

  const orderedSet = new Set(orderedCodes);
  const extras = Array.from(byCode.keys())
    .filter((code) => !orderedSet.has(code))
    .sort();
  const finalCodes = [...orderedCodes, ...extras];

  return [
    ...base,
    ...finalCodes.map((code) => {
      const def = byCode.get(code);
      const label = def?.name?.trim() || titleCaseStatusCode(code);
      return { value: code, label };
    }),
  ];
}

export function odStatusFilterFromDefs(
  odDefs: LeaveOdStatusDef[],
  allLabel = 'All Status'
): { value: string; label: string }[] {
  const filtered = filterStatusDefsForOd(odDefs);
  return buildStatusFilterOptions(filtered, OD_STATUS_ORDER, allLabel);
}

export function leaveStatusFilterFromDefs(
  leaveDefs: LeaveOdStatusDef[],
  allLabel = 'All Status'
): { value: string; label: string }[] {
  const defs = (leaveDefs || [])
    .filter((d) => d?.code)
    .slice();
  return buildStatusFilterOptions(defs, LEAVE_STATUS_ORDER, allLabel);
}
