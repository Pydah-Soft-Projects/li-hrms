/** Shared helpers for payslip list filters (workspace + superadmin). */

import { entityRefId } from '@/lib/loanListUi';
import { departmentsForDivisionFilter } from '@/lib/manualDeductionListUi';

export const PAYSLIP_LIST_STATUS_OPTIONS = [
  { id: 'calculated', name: 'Calculated' },
  { id: 'approved', name: 'Approved' },
  { id: 'processed', name: 'Processed' },
];

export type PayslipListRow = {
  emp_no?: string;
  status?: string;
  employeeId?: {
    _id?: string;
    employee_name?: string;
    emp_no?: string;
    department_id?: { _id?: string; name?: string } | string;
    designation_id?: { _id?: string; name?: string } | string;
  } | string;
};

export function payslipMatchesSearch(record: PayslipListRow, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.toLowerCase();
  const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
  return (
    (record.emp_no ?? '').toLowerCase().includes(q)
    || (employee?.employee_name ?? '').toLowerCase().includes(q)
    || (employee?.emp_no ?? '').toLowerCase().includes(q)
  );
}

export function payslipMatchesListOrgAndStatus(
  record: PayslipListRow,
  divisions: any[],
  departments: any[],
  filterDivisions: string[],
  filterDepartments: string[],
  filterDesignations: string[],
  filterStatuses: string[],
): boolean {
  if (filterStatuses.length > 0 && record.status && !filterStatuses.includes(record.status)) {
    return false;
  }

  const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
  const deptId = entityRefId(employee?.department_id);
  const desigId = entityRefId(employee?.designation_id);

  if (filterDepartments.length > 0) {
    if (!deptId || !filterDepartments.includes(deptId)) return false;
  }

  if (filterDesignations.length > 0) {
    if (!desigId || !filterDesignations.includes(desigId)) return false;
  }

  if (filterDivisions.length > 0) {
    const allowed = departmentsForDivisionFilter(divisions, departments, filterDivisions);
    const allowedIds = new Set(allowed.map((d: any) => String(d._id)));
    if (!deptId || !allowedIds.has(deptId)) return false;
  }

  return true;
}
