/** Pure helpers for list-row employee identity (no React components). */

export type EmployeeListDisplaySource = {
  employeeId?: {
    employee_name?: string;
    emp_no?: string;
    profilePhoto?: string;
    photo?: string;
    department_id?: { name?: string; code?: string } | string;
    designation_id?: { name?: string; title?: string; code?: string } | string;
    department?: { name?: string; code?: string };
    designation?: { name?: string; title?: string; code?: string };
    division_id?: { name?: string; code?: string } | string;
    division?: { name?: string; code?: string };
    dynamicFields?: Record<string, unknown>;
  } | null;
  employee_name?: string;
  emp_no?: string;
  department?: { name?: string; code?: string } | string;
  designation?: { name?: string; title?: string; code?: string } | string;
  division_id?: { name?: string; code?: string } | string;
};

export type EmployeeListDisplayParts = {
  name: string;
  empNo: string;
  profilePhoto: string;
  designation: string;
  department: string;
  division: string;
  empDesigLine: string;
  deptDivLine: string;
  tooltip: string;
};

function refName(
  ref: unknown,
  list?: { _id?: string; name?: string; code?: string; title?: string }[],
): string {
  if (ref == null || ref === '') return '';
  if (typeof ref === 'object' && ref !== null) {
    const o = ref as { name?: string; code?: string; title?: string };
    return o.name || o.title || o.code || '';
  }
  const hit = list?.find((x) => String(x._id) === String(ref));
  return hit?.name || hit?.title || hit?.code || '';
}

export function resolveEmployeeListDisplayParts(
  source: EmployeeListDisplaySource,
  lookups?: {
    divisions?: { _id?: string; name?: string; code?: string }[];
    departments?: { _id?: string; name?: string; code?: string }[];
    designations?: { _id?: string; name?: string; title?: string; code?: string }[];
  },
): EmployeeListDisplayParts {
  const emp = source.employeeId;
  const name =
    (source.employee_name || emp?.employee_name || source.emp_no || emp?.emp_no || 'Unknown').trim();
  const empNo = String(source.emp_no || emp?.emp_no || '').trim();
  const profilePhoto = String(
    emp?.profilePhoto ||
      emp?.photo ||
      (emp?.dynamicFields?.profilePhoto as string) ||
      '',
  ).trim();

  const designation =
    refName(source.designation, lookups?.designations) ||
    refName(emp?.designation, lookups?.designations) ||
    refName(emp?.designation_id, lookups?.designations);

  const department =
    refName(source.department, lookups?.departments) ||
    refName(emp?.department, lookups?.departments) ||
    refName(emp?.department_id, lookups?.departments);

  const division =
    refName(source.division_id, lookups?.divisions) ||
    refName(emp?.division_id, lookups?.divisions) ||
    refName(emp?.division, lookups?.divisions) ||
    '';

  const empDesigLine = [empNo ? `#${empNo}` : '', designation].filter(Boolean).join(' • ');
  const deptDivLine = [department, division].filter(Boolean).join(' • ');
  const tooltip = [name, empDesigLine, deptDivLine].filter(Boolean).join(' | ');

  return {
    name,
    empNo,
    profilePhoto,
    designation,
    department,
    division,
    empDesigLine,
    deptDivLine,
    tooltip,
  };
}
