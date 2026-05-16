/**
 * Natural sort by employee number (emp_no) — use everywhere employees are listed.
 */

function normalizeEmpNo(value) {
  return String(value ?? '').trim();
}

/**
 * @param {string|number|null|undefined} a
 * @param {string|number|null|undefined} b
 * @returns {number}
 */
function compareEmpNo(a, b) {
  const sa = normalizeEmpNo(a);
  const sb = normalizeEmpNo(b);
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string|number|null|undefined} [getEmpNo]
 * @returns {T[]}
 */
function sortByEmpNo(items, getEmpNo = (item) => item?.emp_no ?? item?.employeeNumber ?? item?.employee?.emp_no) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => compareEmpNo(getEmpNo(a), getEmpNo(b)));
}

/** Mongoose sort object for employee lists */
const EMP_NO_SORT = { emp_no: 1 };

module.exports = {
  compareEmpNo,
  sortByEmpNo,
  EMP_NO_SORT,
};
