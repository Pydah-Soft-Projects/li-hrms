/**
 * Natural / numeric sort by employee number (emp_no) — 1,2,…9,10,…100 not 1,10,2.
 */

/** MongoDB collation: string emp_no sorts with numeric ordering (requires MongoDB 3.4+). */
const EMP_NO_COLLATION = { locale: 'en', strength: 2, numericOrdering: true };

const EMP_NO_SORT = { emp_no: 1 };

function normalizeEmpNo(value) {
  return String(value ?? '').trim();
}

/**
 * Compare two digit-only strings as integers (BigInt for long codes).
 */
function compareDigitRun(a, b) {
  try {
    const da = BigInt(a);
    const db = BigInt(b);
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  } catch {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
}

/**
 * Natural sort: split into digit and non-digit runs; compare number runs numerically.
 */
function compareNaturalStrings(sa, sb) {
  const tokenize = (s) => {
    const out = [];
    const re = /(\d+)|(\D+)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      out.push(m[0]);
    }
    return out.length ? out : [s];
  };

  const ap = tokenize(sa);
  const bp = tokenize(sb);
  const n = Math.min(ap.length, bp.length);

  for (let i = 0; i < n; i++) {
    const aSeg = ap[i];
    const bSeg = bp[i];
    const aNum = /^\d+$/.test(aSeg);
    const bNum = /^\d+$/.test(bSeg);
    if (aNum && bNum) {
      const c = compareDigitRun(aSeg, bSeg);
      if (c !== 0) return c;
    } else if (aNum !== bNum) {
      // Prefer consistent ordering: digit block before non-digit (rare in same position)
      return aNum ? -1 : 1;
    } else {
      const c = aSeg.localeCompare(bSeg, undefined, { sensitivity: 'base' });
      if (c !== 0) return c;
    }
  }

  return ap.length - bp.length;
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
  return compareNaturalStrings(sa, sb);
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

module.exports = {
  compareEmpNo,
  sortByEmpNo,
  EMP_NO_SORT,
  EMP_NO_COLLATION,
};
