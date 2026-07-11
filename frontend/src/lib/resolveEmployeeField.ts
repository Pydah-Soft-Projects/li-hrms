const SKIP_NESTED_BUCKETS = new Set([
  'dynamicFields',
  'qualifications',
  'employeeAllowances',
  'employeeDeductions',
  'department',
  'designation',
  'division',
  'employee_group',
  'salaries',
]);

function readScalar(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';
  const s = String(value).trim();
  return s;
}

function readFromBucket(bucket: unknown, keys: string[]): string {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  const obj = bucket as Record<string, unknown>;
  for (const key of keys) {
    const v = readScalar(obj[key]);
    if (v) return v;
  }
  return '';
}

/**
 * Resolve a permanent employee/application field from top-level or dynamicFields (legacy).
 */
export function resolveEmployeeField(
  record: Record<string, unknown> | null | undefined,
  fieldId: string,
  aliases: string[] = []
): string {
  if (!record) return '';

  const dynamicFields = (record.dynamicFields || {}) as Record<string, unknown>;
  const keys = [fieldId, ...aliases];

  for (const key of keys) {
    const v = readScalar(record[key]);
    if (v) return v;
  }

  for (const key of keys) {
    const v = readScalar(dynamicFields[key]);
    if (v) return v;
  }

  for (const bucket of Object.values(dynamicFields)) {
    const v = readFromBucket(bucket, keys);
    if (v) return v;
  }

  for (const [bucketKey, bucket] of Object.entries(record)) {
    if (SKIP_NESTED_BUCKETS.has(bucketKey)) continue;
    const v = readFromBucket(bucket, keys);
    if (v) return v;
  }

  return '';
}
