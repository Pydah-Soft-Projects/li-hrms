/**
 * Build a partial employee update payload containing only fields that changed
 * vs the existing employee record. Used for direct edit and profile-request modes.
 */

const EDIT_SKIP_FIELDS = new Set([
  '_id',
  'createdAt',
  'updatedAt',
  '__v',
  'status',
  'is_active',
  'isProfileRequest',
  'allData',
  'alldata',
  'division',
  'department',
  'designation',
  'employee_group',
  'employeegroup',
  'AllData',
  'Division',
  'Department',
  'Designation',
  'EmployeeGroup',
  'lastLogin',
  'last_login',
  'updated_at',
  'created_at',
  'v',
  '_v',
  'password',
  'plain_password',
  'weekdayShiftSchedule',
]);

const FIELD_COMPARE_MAP: Record<string, string> = {
  proposedSalary: 'gross_salary',
};

function normalizeForCompare(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (v === 0 || v === '0') return null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return Number(v);
  }
  if (Array.isArray(v) && v.length === 0) return null;
  if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if (obj._id) return String(obj._id);
    if (Object.keys(obj).length === 0) return null;
  }
  return v;
}

function resolveOriginalValue(original: Record<string, any>, targetKey: string): unknown {
  let origValue = original[targetKey];
  if (origValue === undefined && original.dynamicFields) {
    origValue = original.dynamicFields[targetKey];
  }
  // Populated refs: compare by id
  if (origValue && typeof origValue === 'object' && (origValue as any)._id) {
    return String((origValue as any)._id);
  }
  return origValue;
}

/**
 * Returns only keys from submitData that differ from editingEmployee.
 * Always includes emp_no when present (identity).
 */
export function pickChangedEmployeeFields(
  submitData: Record<string, any>,
  editingEmployee: Record<string, any>,
  options?: { alwaysIncludeName?: boolean }
): Record<string, any> {
  const changed: Record<string, any> = {};
  const alwaysIncludeName = options?.alwaysIncludeName !== false;

  Object.entries(submitData).forEach(([key, value]) => {
    if (key === 'emp_no') {
      if (value !== undefined && value !== null && value !== '') changed[key] = value;
      return;
    }
    if (key === 'employee_name' && alwaysIncludeName) {
      // Include name only when it actually changed (identity not required for PUT :empNo)
      // fall through to compare
    }

    if (EDIT_SKIP_FIELDS.has(key) || EDIT_SKIP_FIELDS.has(key.toLowerCase())) return;

    const targetKey = FIELD_COMPARE_MAP[key] || key;
    const origValue = resolveOriginalValue(editingEmployee, targetKey);
    const normOrig = normalizeForCompare(origValue);
    const normNew = normalizeForCompare(value);

    try {
      if (JSON.stringify(normOrig) !== JSON.stringify(normNew)) {
        changed[key] = value;
      }
    } catch {
      if (normOrig !== normNew) changed[key] = value;
    }
  });

  return changed;
}

export function qualificationsChanged(
  nextQuals: unknown,
  editingEmployee: Record<string, any> | null | undefined
): boolean {
  if (!editingEmployee) return true;
  const orig = editingEmployee.qualifications ?? editingEmployee.dynamicFields?.qualifications ?? [];
  try {
    return JSON.stringify(normalizeForCompare(nextQuals)) !== JSON.stringify(normalizeForCompare(orig));
  } catch {
    return true;
  }
}
