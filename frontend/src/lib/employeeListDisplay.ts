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
  const str = String(ref).trim();
  if (!str) return '';

  const hitById = list?.find((x) => String(x._id) === str);
  if (hitById) return hitById.name || hitById.title || hitById.code || '';

  const hitByName = list?.find(
    (x) =>
      (x.name && x.name.toLowerCase() === str.toLowerCase()) ||
      (x.code && x.code.toLowerCase() === str.toLowerCase())
  );
  if (hitByName) return hitByName.name || hitByName.title || hitByName.code || '';

  // If it's already a non-ObjectId string (e.g. human-readable name like 'TEACHING'), return it
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(str);
  if (!isObjectId) return str;

  return '';
}

/** Resolve division / department / designation / employee group labels for view dialogs and lists. */
export function resolveEmployeeOrgRefName(
  record: object | null | undefined,
  refKey: 'division' | 'department' | 'designation' | 'employee_group',
  idKey: 'division_id' | 'department_id' | 'designation_id' | 'employee_group_id',
  lookups?: { _id?: string; name?: string; code?: string; title?: string }[],
): string {
  if (!record) return '-';
  const row = record as Record<string, unknown>;
  const df = (row.dynamicFields && typeof row.dynamicFields === 'object' ? row.dynamicFields : {}) as Record<string, unknown>;
  const basicInfo = (row.basic_info && typeof row.basic_info === 'object' ? row.basic_info : {}) as Record<string, unknown>;

  let name =
    refName(row[refKey], lookups) ||
    refName(row[idKey], lookups) ||
    refName(df[refKey], lookups) ||
    refName(df[idKey], lookups) ||
    refName(basicInfo[refKey], lookups) ||
    refName(basicInfo[idKey], lookups);

  if (!name && refKey === 'employee_group') {
    name =
      refName(row.employeeGroup, lookups) ||
      refName(row.employeeGroupId, lookups) ||
      refName(df.employeeGroup, lookups) ||
      refName(df.employeeGroupId, lookups) ||
      refName(basicInfo.employeeGroup, lookups) ||
      refName(basicInfo.employeeGroupId, lookups);
  }

  return name || '-';
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
