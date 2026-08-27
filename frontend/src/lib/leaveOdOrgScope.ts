import type { ScopeUser } from '@/lib/departmentScopeUtils';

function refId(ref: unknown): string {
  if (ref == null) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref !== null && '_id' in ref) {
    return String((ref as { _id: unknown })._id ?? '');
  }
  return String(ref);
}

/** Division/department stamped on the leave or OD record at apply time. */
export function getLeaveOdRecordOrgIds(item: Record<string, unknown>): {
  divisionId: string;
  departmentId: string;
  divisionName: string;
  departmentName: string;
} {
  const divisionId =
    refId(item.division_id) ||
    refId((item.division_id as { _id?: unknown } | undefined)?._id);
  const departmentId =
    refId(item.department_id) ||
    refId(item.department) ||
    refId((item.department as { _id?: unknown } | undefined)?._id);

  const divisionName =
    String(item.division_name || '').trim() ||
    String((item.division_id as { name?: string } | undefined)?.name || '').trim();
  const departmentName =
    String(item.department_name || '').trim() ||
    String((item.department as { name?: string } | undefined)?.name || '').trim();

  return { divisionId, departmentId, divisionName, departmentName };
}

/**
 * Mirrors backend checkJurisdiction org-scope (record dept/division vs user divisionMapping).
 * Reporting managers assigned on the workflow are always in scope.
 */
export function isLeaveOdInUserOrgScope(
  user: ScopeUser | null | undefined,
  item: Record<string, unknown>
): boolean {
  if (!user) return false;
  if (user.role === 'super_admin' || user.dataScope === 'all') return true;

  const userId = refId((user as { _id?: unknown; id?: unknown })._id ?? (user as { id?: unknown }).id);
  const reportingManagerIds = (
    (item.workflow as { reportingManagerIds?: string[] } | undefined)?.reportingManagerIds || []
  ).map(refId);
  if (userId && reportingManagerIds.includes(userId)) return true;

  const { divisionId, departmentId } = getLeaveOdRecordOrgIds(item);
  if (!divisionId) return false;

  const mapping = user.divisionMapping;
  if (!mapping?.length) return false;

  return mapping.some((entry) => {
    const mapDivId = refId(entry.division);
    if (mapDivId !== divisionId) return false;
    if (!entry.departments?.length) return true;
    if (!departmentId) return false;
    return entry.departments.some((dept) => refId(dept) === departmentId);
  });
}

/** Visible to viewer but outside their org scope (e.g. pre-transfer record seen by new HOD). */
export function isPreviousOrgLeaveOdForViewer(
  user: ScopeUser | null | undefined,
  item: Record<string, unknown>
): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (['super_admin', 'sub_admin', 'employee'].includes(role)) return false;
  if (isLeaveOdInUserOrgScope(user, item)) return false;

  const { divisionId, departmentId } = getLeaveOdRecordOrgIds(item);
  return Boolean(divisionId || departmentId);
}

export function getPreviousOrgBadgeLabel(item: Record<string, unknown>): string {
  const { departmentName, divisionName } = getLeaveOdRecordOrgIds(item);
  if (departmentName && divisionName) return `Previous org · ${departmentName}, ${divisionName}`;
  if (departmentName) return `Previous org · ${departmentName}`;
  if (divisionName) return `Previous org · ${divisionName}`;
  return 'Previous org';
}

export function getPreviousOrgActionHint(item: Record<string, unknown>): string {
  const { departmentName, divisionName } = getLeaveOdRecordOrgIds(item);
  const orgLabel = [departmentName, divisionName].filter(Boolean).join(', ') || 'the previous department/division';
  return `This request belongs to ${orgLabel}. Approval actions are disabled — the previous org HOD or manager must act on it.`;
}
