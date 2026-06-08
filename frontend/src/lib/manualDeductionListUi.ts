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

/** Departments available when one or more divisions are selected (loans page pattern). */
export function departmentsForDivisionFilter(
  divisions: any[],
  departments: any[],
  filterDivisions: string[],
): any[] {
  if (filterDivisions.length === 0) return departments;
  const allowed = new Set<string>();
  for (const divId of filterDivisions) {
    const div = divisions.find((d: any) => String(d._id) === String(divId));
    const deptIds = ((div?.departments ?? []) as any[]).map((d: any) => (typeof d === 'string' ? d : d?._id));
    if (deptIds.length) {
      deptIds.forEach((id) => {
        if (id) allowed.add(String(id));
      });
    } else {
      departments
        .filter((d: any) => String(d.division_id || d.division) === String(divId))
        .forEach((d: any) => allowed.add(String(d._id)));
    }
  }
  if (allowed.size === 0) {
    return departments.filter((d: any) => filterDivisions.includes(String(d.division_id || d.division)));
  }
  return departments.filter((d: any) => allowed.has(String(d._id)));
}
