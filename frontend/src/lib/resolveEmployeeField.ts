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
    const top = record[key];
    if (top !== undefined && top !== null && String(top).trim() !== '') {
      return String(top);
    }
  }

  for (const key of keys) {
    const dyn = dynamicFields[key];
    if (dyn !== undefined && dyn !== null && String(dyn).trim() !== '') {
      return String(dyn);
    }
  }

  return '';
}
