import { Employee } from '@/lib/api';

function resolveRefName(ref: unknown): string {
  if (!ref) return '';
  if (typeof ref === 'object' && ref !== null && 'name' in ref) {
    return String((ref as { name?: string }).name || '').trim();
  }
  return '';
}

export function getEmployeeDesignation(emp: Employee | null | undefined): string {
  if (!emp) return '';
  return resolveRefName(emp.designation_id) || resolveRefName(emp.designation);
}

export function getEmployeeDepartment(emp: Employee | null | undefined): string {
  if (!emp) return '';
  return resolveRefName(emp.department_id) || resolveRefName(emp.department);
}

export function getEmployeeDivision(emp: Employee | null | undefined): string {
  if (!emp) return '';
  return resolveRefName(emp.division_id) || resolveRefName(emp.division);
}

export function getEmployeeProfilePhoto(emp: Employee | null | undefined): string | undefined {
  if (!emp) return undefined;
  const url =
    emp.profilePhoto ||
    (emp.dynamicFields as { profilePhoto?: string } | undefined)?.profilePhoto;
  const s = url ? String(url).trim() : '';
  return s || undefined;
}

export function getEmployeeInitials(emp: Employee | null | undefined): string {
  const name = String(emp?.employee_name || emp?.emp_no || '?').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getEmployeeRosterTooltip(emp: Employee | null | undefined): string {
  if (!emp) return '';
  return [
    emp.employee_name || '—',
    getEmployeeDesignation(emp),
    getEmployeeDepartment(emp),
    getEmployeeDivision(emp),
    emp.emp_no,
  ]
    .filter(Boolean)
    .join(' · ');
}
