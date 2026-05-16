/**
 * Natural sort by employee number — use everywhere employees are listed.
 */

export function compareEmpNo(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): number {
  const sa = String(a ?? '').trim();
  const sb = String(b ?? '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortByEmpNo<T>(
  items: T[],
  getEmpNo: (item: T) => string | number | null | undefined = (item: any) =>
    item?.emp_no ?? item?.employeeNumber ?? item?.employee?.emp_no
): T[] {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => compareEmpNo(getEmpNo(a), getEmpNo(b)));
}
