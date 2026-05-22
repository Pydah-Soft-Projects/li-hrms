/** Shared helpers for workspace + superadmin loan / advance list UI */

export type LoanListRow = {
  employeeId?: { employee_name?: string; emp_no?: string };
  emp_no?: string;
  status?: string;
  reason?: string;
  department?: { _id?: string; name?: string } | string;
  designation?: { _id?: string; name?: string } | string;
  division_id?: { _id?: string; name?: string; code?: string } | string;
};

export function entityRefId(ref: unknown): string {
  if (ref == null || ref === '') return '';
  if (typeof ref === 'object' && ref !== null && '_id' in (ref as Record<string, unknown>)) {
    return String((ref as { _id: string })._id);
  }
  return String(ref);
}

export const LOAN_LIST_STATUS_OPTIONS: { id: string; name: string }[] = [
  { id: 'draft', name: 'Draft' },
  { id: 'pending', name: 'Pending' },
  { id: 'hod_approved', name: 'HOD approved' },
  { id: 'hod_rejected', name: 'HOD rejected' },
  { id: 'manager_approved', name: 'Manager approved' },
  { id: 'manager_rejected', name: 'Manager rejected' },
  { id: 'hr_approved', name: 'HR approved' },
  { id: 'hr_rejected', name: 'HR rejected' },
  { id: 'approved', name: 'Approved' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'cancelled', name: 'Cancelled' },
  { id: 'disbursed', name: 'Disbursed' },
  { id: 'active', name: 'Active' },
  { id: 'completed', name: 'Completed' },
];

export type LoanListEmployeeParts = {
  primary: string;
  empNo: string;
  division: string;
  department: string;
  designation: string;
  /** Department • designation (attendance-style second line when no division row) */
  deptDesig: string;
  /** Single-line summary for tooltips */
  line: string;
  /** Legacy compact string */
  meta: string;
};

export function buildLoanListEmployeeParts(
  loan: LoanListRow,
  divisions: any[],
  departments: any[],
  designations: any[],
): LoanListEmployeeParts {
  const primary =
    loan.employeeId?.employee_name
    || loan.emp_no
    || 'Unknown';
  const empNo = loan.emp_no || loan.employeeId?.emp_no || '';

  let divName = '';
  const divRef = loan.division_id;
  if (divRef && typeof divRef === 'object') {
    divName = (divRef as { name?: string; code?: string }).name || (divRef as { code?: string }).code || '';
  } else if (divRef) {
    const d = divisions.find((x: any) => String(x._id) === String(divRef));
    divName = d?.name || d?.code || '';
  }

  let deptName = '';
  if (loan.department && typeof loan.department === 'object') {
    deptName = (loan.department as { name?: string }).name || '';
  } else if (loan.department) {
    const d = departments.find((x: any) => String(x._id) === String(loan.department));
    deptName = d?.name || d?.code || '';
  }

  let desigName = '';
  if (loan.designation && typeof loan.designation === 'object') {
    desigName = (loan.designation as { name?: string }).name || '';
  } else if (loan.designation) {
    const d = designations.find((x: any) => String(x._id) === String(loan.designation));
    desigName = d?.name || d?.title || d?.code || '';
  }

  const deptDesig = [deptName, desigName].filter(Boolean).join(' • ');
  const meta = [empNo, divName, deptName, desigName].filter(Boolean).join(' • ');
  const line = meta ? `${primary} | ${meta}` : primary;

  return {
    primary,
    empNo,
    division: divName,
    department: deptName,
    designation: desigName,
    deptDesig,
    line,
    meta,
  };
}

/** @deprecated Use buildLoanListEmployeeParts + LoanListEmployeeCell */
export function buildLoanListEmployeeDisplay(
  loan: LoanListRow,
  divisions: any[],
  departments: any[],
  designations: any[],
): { primary: string; line: string; meta: string } {
  const p = buildLoanListEmployeeParts(loan, divisions, departments, designations);
  return { primary: p.primary, line: p.line, meta: p.meta };
}

export function loanMatchesListOrgAndStatus(
  loan: LoanListRow,
  filterDivisions: string[],
  filterDepartments: string[],
  filterDesignations: string[],
  filterStatuses: string[],
): boolean {
  if (filterStatuses.length > 0 && loan.status && !filterStatuses.includes(loan.status)) return false;

  const divId = entityRefId(loan.division_id);
  if (filterDivisions.length > 0) {
    if (!divId || !filterDivisions.includes(divId)) return false;
  }

  const deptId = entityRefId(loan.department);
  if (filterDepartments.length > 0) {
    if (!deptId || !filterDepartments.includes(deptId)) return false;
  }

  const desigId = entityRefId(loan.designation);
  if (filterDesignations.length > 0) {
    if (!desigId || !filterDesignations.includes(desigId)) return false;
  }

  return true;
}

export function loanMatchesSearch(loan: LoanListRow, searchTerm: string): boolean {
  if (!searchTerm.trim()) return true;
  const q = searchTerm.toLowerCase();
  return (
    (loan.employeeId?.employee_name || '').toLowerCase().includes(q)
    || (loan.emp_no || loan.employeeId?.emp_no || '').toLowerCase().includes(q)
    || (loan.reason || '').toLowerCase().includes(q)
  );
}
