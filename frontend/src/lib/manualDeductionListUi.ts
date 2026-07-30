/** Shared list filter helpers for manual deductions (workspace + superadmin). */

import { entityRefId } from '@/lib/loanListUi';

export type ManualDeductionListRow = {
  status?: string;
  reason?: string;
  employee?: {
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no?: string;
    division_id?: { _id?: string; name?: string; code?: string } | string;
    department_id?: { _id?: string; name?: string; code?: string } | string;
    designation_id?: { _id?: string; name?: string; code?: string; title?: string } | string;
  };
};

export const DEDUCTION_LIST_STATUS_OPTIONS: { id: string; name: string }[] = [
  { id: 'draft', name: 'Draft' },
  { id: 'pending_hod', name: 'Pending HOD' },
  { id: 'pending_hr', name: 'Pending HR' },
  { id: 'pending_admin', name: 'Pending Admin' },
  { id: 'approved', name: 'Approved' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'partially_settled', name: 'Partially settled' },
  { id: 'settled', name: 'Settled' },
  { id: 'cancelled', name: 'Cancelled' },
];

export function deductionMatchesListOrgAndStatus(
  row: ManualDeductionListRow,
  filterDivisions: string[],
  filterDepartments: string[],
  filterDesignations: string[],
  filterStatuses: string[],
): boolean {
  if (filterStatuses.length > 0 && row.status && !filterStatuses.includes(row.status)) return false;

  const divId = entityRefId(row.employee?.division_id);
  if (filterDivisions.length > 0) {
    if (!divId || !filterDivisions.includes(divId)) return false;
  }

  const deptId = entityRefId(row.employee?.department_id);
  if (filterDepartments.length > 0) {
    if (!deptId || !filterDepartments.includes(deptId)) return false;
  }

  const desigId = entityRefId(row.employee?.designation_id);
  if (filterDesignations.length > 0) {
    if (!desigId || !filterDesignations.includes(desigId)) return false;
  }

  return true;
}

export function deductionMatchesSearch(row: ManualDeductionListRow, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.toLowerCase();
  const emp = row.employee;
  const name = (
    emp?.employee_name
    || [emp?.first_name, emp?.last_name].filter(Boolean).join(' ')
    || ''
  ).toLowerCase();
  const empNo = (emp?.emp_no || '').toLowerCase();
  const divName = (
    typeof emp?.division_id === 'object' ? emp?.division_id?.name || emp?.division_id?.code : ''
  )?.toString().toLowerCase() || '';
  const deptName = (
    typeof emp?.department_id === 'object' ? emp?.department_id?.name || emp?.department_id?.code : ''
  )?.toString().toLowerCase() || '';
  const desigName = (
    typeof emp?.designation_id === 'object'
      ? emp?.designation_id?.name || emp?.designation_id?.title || emp?.designation_id?.code
      : ''
  )?.toString().toLowerCase() || '';

  return (
    name.includes(q)
    || empNo.includes(q)
    || divName.includes(q)
    || deptName.includes(q)
    || desigName.includes(q)
    || (row.reason || '').toLowerCase().includes(q)
  );
}

export function deductionMatchesTab(row: ManualDeductionListRow, activeTab: string): boolean {
  if (activeTab === 'all') return true;
  if (activeTab === 'pending') {
    return ['pending_hod', 'pending_hr', 'pending_admin'].includes(row.status || '');
  }
  return row.status === activeTab;
}

/** True if a department document is linked to the given division id. */
function departmentBelongsToDivision(dept: any, divId: string): boolean {
  const selected = String(divId);
  // Primary: Department.divisions[] (actual model — not division_id)
  const divLinks = (dept?.divisions ?? []) as any[];
  if (divLinks.some((x) => String(x?._id ?? x) === selected)) return true;
  // Legacy single-field shapes
  if (dept?.division_id && String(dept.division_id?._id ?? dept.division_id) === selected) return true;
  if (dept?.division && String(dept.division?._id ?? dept.division) === selected) return true;
  return false;
}

/**
 * Departments available when one or more divisions are selected.
 * Matches attendance / employees filter behavior:
 * 1) Prefer Division.departments (already scope-mapped by GET /divisions)
 * 2) Union with catalog depts linked via Department.divisions[] / legacy fields
 *    so incomplete master links on either side do not hide in-scope departments.
 */
export function departmentsForDivisionFilter(
  divisions: any[],
  departments: any[],
  filterDivisions: string[],
): any[] {
  if (filterDivisions.length === 0) return departments;

  const selected = filterDivisions.map(String);
  const byId = new Map<string, any>();

  for (const divId of selected) {
    const div = divisions.find((d: any) => String(d._id) === divId);
    const nested = div?.departments;
    if (!Array.isArray(nested) || nested.length === 0) continue;

    for (const x of nested) {
      if (!x) continue;
      if (typeof x === 'string') {
        const fromCatalog = departments.find((d: any) => String(d._id) === String(x));
        const dept = fromCatalog || { _id: String(x), name: String(x) };
        byId.set(String(dept._id), dept);
      } else {
        const id = String(x._id);
        const fromCatalog = departments.find((d: any) => String(d._id) === id);
        byId.set(id, fromCatalog || { _id: id, name: x.name || 'Department', code: x.code });
      }
    }
  }

  for (const dept of departments) {
    if (selected.some((divId) => departmentBelongsToDivision(dept, divId))) {
      byId.set(String(dept._id), dept);
    }
  }

  // Single college selected (workspace auto-select): keep scoped catalog depts not yet linked
  if (selected.length === 1 && byId.size === 0) {
    return departments;
  }
  if (selected.length === 1) {
    for (const dept of departments) {
      const divLinks = (dept?.divisions ?? []) as any[];
      if (!divLinks || divLinks.length === 0) {
        byId.set(String(dept._id), dept);
      }
    }
  }

  if (byId.size > 0) return Array.from(byId.values());

  return departments.filter((dept: any) =>
    selected.some((divId) => departmentBelongsToDivision(dept, divId)),
  );
}
