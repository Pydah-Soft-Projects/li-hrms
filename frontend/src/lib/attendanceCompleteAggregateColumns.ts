/** Trailing summary columns for the attendance "Complete" table (workspace vs superadmin). */

export const WORKSPACE_COMPLETE_AGGREGATE_KEYS = [
  'present',
  'leaves',
  'weekOffs',
  'holidays',
  'otHours',
  'extraHours',
  'permissions',
  'lateEarly',
  'attDed',
  'payableShifts',
] as const;

export type WorkspaceCompleteAggregateKey = (typeof WORKSPACE_COMPLETE_AGGREGATE_KEYS)[number];

export const SUPERADMIN_COMPLETE_AGGREGATE_KEYS = [
  'present',
  'leaves',
  'absent',
  'weekOffs',
  'holidays',
  'otHours',
  'extraHours',
  'permissions',
  'lateEarly',
  'attDed',
  'payableShifts',
] as const;

export type SuperadminCompleteAggregateKey = (typeof SUPERADMIN_COMPLETE_AGGREGATE_KEYS)[number];

export const WORKSPACE_COMPLETE_AGGREGATE_LABELS: Record<WorkspaceCompleteAggregateKey, string> = {
  present: 'Days present',
  leaves: 'Leaves',
  weekOffs: 'Week offs',
  holidays: 'Holidays',
  otHours: 'OT hours',
  extraHours: 'Extra hours',
  permissions: 'Permissions',
  lateEarly: 'Late / early',
  attDed: 'Attendance deduction',
  payableShifts: 'Payable shifts',
};

export const SUPERADMIN_COMPLETE_AGGREGATE_LABELS: Record<SuperadminCompleteAggregateKey, string> = {
  present: 'Days present',
  leaves: 'Leaves',
  absent: 'Absent',
  weekOffs: 'Week offs',
  holidays: 'Holidays',
  otHours: 'OT hours',
  extraHours: 'Extra hours',
  permissions: 'Permissions',
  lateEarly: 'Late / early',
  attDed: 'Attendance deduction',
  payableShifts: 'Payable shifts',
};

/** Align with backend `normalizeCompleteSummaryColumns` (defaults true; at least one column on per view). */
export function normalizeCompleteSummaryColumns(
  raw: Record<string, unknown> | null | undefined
): Record<SuperadminCompleteAggregateKey, boolean> {
  const base = Object.fromEntries(SUPERADMIN_COMPLETE_AGGREGATE_KEYS.map((k) => [k, true])) as Record<
    SuperadminCompleteAggregateKey,
    boolean
  >;
  if (raw && typeof raw === 'object') {
    for (const k of SUPERADMIN_COMPLETE_AGGREGATE_KEYS) {
      if (typeof raw[k] === 'boolean') base[k] = raw[k];
    }
  }
  if (!WORKSPACE_COMPLETE_AGGREGATE_KEYS.some((k) => base[k])) base.present = true;
  if (!SUPERADMIN_COMPLETE_AGGREGATE_KEYS.some((k) => base[k])) base.present = true;
  return base;
}

export function workspaceVisibleCompleteKeys(
  org: Record<SuperadminCompleteAggregateKey, boolean>
): WorkspaceCompleteAggregateKey[] {
  return WORKSPACE_COMPLETE_AGGREGATE_KEYS.filter((k) => org[k]);
}

export function superadminVisibleCompleteKeys(
  org: Record<SuperadminCompleteAggregateKey, boolean>
): SuperadminCompleteAggregateKey[] {
  return SUPERADMIN_COMPLETE_AGGREGATE_KEYS.filter((k) => org[k]);
}

export function countVisibleCompleteColumns(
  visibility: Record<string, boolean>,
  keys: readonly string[]
): number {
  return keys.reduce((n, k) => n + (visibility[k] ? 1 : 0), 0);
}
