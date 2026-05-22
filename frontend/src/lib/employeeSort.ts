/**
 * Natural / numeric sort by employee number — 1,2,…9,10,…100 not 1,10,2.
 */

function normalizeEmpNo(value: string | number | null | undefined): string {
  return String(value ?? '').trim();
}

function compareDigitRun(a: string, b: string): number {
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

function compareNaturalStrings(sa: string, sb: string): number {
  const tokenize = (s: string): string[] => {
    const out: string[] = [];
    const re = /(\d+)|(\D+)/g;
    let m: RegExpExecArray | null;
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
      return aNum ? -1 : 1;
    } else {
      const c = aSeg.localeCompare(bSeg, undefined, { sensitivity: 'base' });
      if (c !== 0) return c;
    }
  }

  return ap.length - bp.length;
}

export function compareEmpNo(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): number {
  const sa = normalizeEmpNo(a);
  const sb = normalizeEmpNo(b);
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return compareNaturalStrings(sa, sb);
}

export function sortByEmpNo<T>(
  items: T[],
  getEmpNo: (item: T) => string | number | null | undefined = (item: any) =>
    item?.emp_no ?? item?.employeeNumber ?? item?.employee?.emp_no
): T[] {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => compareEmpNo(getEmpNo(a), getEmpNo(b)));
}
