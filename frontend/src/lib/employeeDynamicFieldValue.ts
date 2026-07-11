import { resolveEmployeeField } from '@/lib/resolveEmployeeField';

const KNOWN_GROUP_IDS = [
  'basic_info',
  'contact_info',
  'personal_info',
  'bank_details',
  'reporting_authority',
  'salaries',
  'leave_info',
  'leave_information',
];

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
  '_id',
  '__v',
]);

const FIELD_ALIAS_MAP: Record<string, string[]> = {
  phone_number: ['contact_number'],
  present_address: ['address'],
  address: ['present_address'],
  aadhar_number: ['aadhaar_number', 'aadhar_no', 'aadharNumber'],
  bank_account_no: ['account_no', 'bank_ac_no', 'bank_account_number', 'account_number'],
  pf_number: ['pfNumber'],
  esi_number: ['esiNumber'],
  bank_name: ['bankName'],
  bank_place: ['bankPlace'],
  ifsc_code: ['ifsc'],
  salary_mode: ['salaryMode'],
  second_salary: ['secondSalary'],
  proposedSalary: ['gross_salary', 'gross salary'],
  gross_salary: ['proposedSalary', 'proposed salary'],
};

const SALARY_FIELD_IDS = new Set(['proposedSalary', 'gross_salary']);
const CURRENCY_AMOUNT_FIELD_IDS = new Set(['proposedSalary', 'gross_salary', 'second_salary']);

function formatCurrencyFieldDisplay(value: unknown, fieldId?: string, record?: Record<string, any> | null): string {
  const amount = parseSalaryNumber(value);
  if (amount !== undefined) return formatSalaryCurrency(amount);
  if (fieldId && SALARY_FIELD_IDS.has(fieldId) && record) {
    return formatSalaryFieldDisplay(record);
  }
  return formatSalaryCurrency(undefined);
}

export function getFieldAliases(fieldId: string): string[] {
  return FIELD_ALIAS_MAP[fieldId] || [];
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '');
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function readScalar(value: unknown): unknown {
  if (isEmptyValue(value)) return undefined;
  if (typeof value === 'object') return undefined;
  return value;
}

function readFromObject(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  for (const key of keys) {
    const v = readScalar(obj[key]);
    if (v !== undefined) return v;
  }

  const normalizedTargets = new Set(keys.map(normalizeKey));
  for (const [k, v] of Object.entries(obj)) {
    if (normalizedTargets.has(normalizeKey(k))) {
      const scalar = readScalar(v);
      if (scalar !== undefined) return scalar;
    }
  }

  return undefined;
}

function collectLookupKeys(fieldId: string, aliases: string[], fieldLabel?: string): string[] {
  const keys = [fieldId, ...aliases];
  if (fieldLabel && fieldLabel.trim()) {
    keys.push(fieldLabel.trim());
  }
  return [...new Set(keys)];
}

/**
 * Promote nested dynamicFields group values to the root (mirrors edit-form hydration).
 */
export function flattenEmployeeRecordForView(record: Record<string, any> | null | undefined) {
  if (!record || typeof record !== 'object') return record;

  const flat: Record<string, any> = { ...record };
  const df = record.dynamicFields;

  const assignIfEmpty = (fieldId: string, value: unknown) => {
    if (isEmptyValue(value)) return;
    if (typeof value === 'object') return;
    if (isEmptyValue(flat[fieldId])) {
      flat[fieldId] = value;
    }
  };

  if (df && typeof df === 'object') {
    for (const [key, value] of Object.entries(df)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [fieldId, nested] of Object.entries(value as Record<string, unknown>)) {
          assignIfEmpty(fieldId, nested);
        }
      } else {
        assignIfEmpty(key, value);
      }
    }
  }

  for (const groupId of KNOWN_GROUP_IDS) {
    const bucket = record[groupId];
    if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
      for (const [fieldId, value] of Object.entries(bucket as Record<string, unknown>)) {
        assignIfEmpty(fieldId, value);
      }
    }
  }

  if (!isEmptyValue(flat.gross_salary) && isEmptyValue(flat.proposedSalary)) {
    flat.proposedSalary = flat.gross_salary;
  } else if (!isEmptyValue(flat.proposedSalary) && isEmptyValue(flat.gross_salary)) {
    flat.gross_salary = flat.proposedSalary;
  }

  return flat;
}

function parseSalaryNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Resolve gross / proposed salary from root, dynamicFields, or salaries group. */
export function resolveSalaryAmount(record: Record<string, any> | null | undefined): number | undefined {
  if (!record) return undefined;

  const flat = flattenEmployeeRecordForView(record);
  const candidates = [
    flat.gross_salary,
    flat.proposedSalary,
    getEmployeeGroupedDynamicFieldValue(record, 'salaries', 'gross_salary'),
    getEmployeeGroupedDynamicFieldValue(record, 'salaries', 'proposedSalary'),
    getEmployeeGroupedDynamicFieldValue(record, 'basic_info', 'proposedSalary'),
    getEmployeeGroupedDynamicFieldValue(record, 'basic_info', 'gross_salary'),
  ];

  for (const candidate of candidates) {
    const parsed = parseSalaryNumber(candidate);
    if (parsed !== undefined) return parsed;
  }

  return undefined;
}

export function formatSalaryCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return '-';
  return `₹${amount.toLocaleString()}`;
}

export function formatSalaryFieldDisplay(record: Record<string, any> | null | undefined): string {
  return formatSalaryCurrency(resolveSalaryAmount(record));
}

/** Display value for view dialogs — matches edit-form field resolution. */
export function formatEmployeeFieldDisplay(
  employee: Record<string, any> | null | undefined,
  groupId: string,
  fieldId: string,
  aliases: string[] = [],
  fieldLabel?: string
): string {
  const keys = collectLookupKeys(fieldId, [...getFieldAliases(fieldId), ...aliases], fieldLabel);
  for (const key of keys) {
    const grouped = getEmployeeGroupedDynamicFieldValue(employee, groupId, key, fieldLabel);
    if (!isEmptyValue(grouped)) {
      if (SALARY_FIELD_IDS.has(fieldId)) {
        const amount = parseSalaryNumber(grouped);
        return formatSalaryCurrency(amount);
      }
      if (CURRENCY_AMOUNT_FIELD_IDS.has(fieldId)) {
        return formatCurrencyFieldDisplay(grouped, fieldId, employee);
      }
      return String(grouped).trim();
    }
  }
  const resolved = resolveEmployeeField(employee, fieldId, aliases);
  if (resolved) {
    if (CURRENCY_AMOUNT_FIELD_IDS.has(fieldId)) {
      return formatCurrencyFieldDisplay(resolved, fieldId, employee);
    }
    return resolved;
  }

  if (SALARY_FIELD_IDS.has(fieldId)) {
    return formatSalaryFieldDisplay(employee);
  }

  return '-';
}

/**
 * Resolve a configurable form-group field on an employee.
 * Salaries group: values come only from employee.salaries (schema field).
 * Other groups: root, then dynamicFields (flat, nested by group, or any nested bucket).
 */
export function getEmployeeGroupedDynamicFieldValue(
  employee: Record<string, any> | null | undefined,
  groupId: string,
  fieldId: string,
  fieldLabel?: string
): any {
  if (!employee) return undefined;

  const keys = collectLookupKeys(fieldId, getFieldAliases(fieldId), fieldLabel);

  if (groupId === 'salaries') {
    const s = employee.salaries;
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const fromSalaries = readFromObject(s as Record<string, unknown>, keys);
      if (fromSalaries !== undefined) return fromSalaries;
    }
  }

  const rootHit = readFromObject(employee as Record<string, unknown>, keys);
  if (rootHit !== undefined) return rootHit;

  const df = employee.dynamicFields;
  if (df && typeof df === 'object') {
    const flatHit = readFromObject(df as Record<string, unknown>, keys);
    if (flatHit !== undefined) return flatHit;

    const preferredGroup = (df as Record<string, unknown>)[groupId];
    const preferredHit = readFromObject(preferredGroup as Record<string, unknown>, keys);
    if (preferredHit !== undefined) return preferredHit;

    for (const bucket of Object.values(df)) {
      const nestedHit = readFromObject(bucket as Record<string, unknown>, keys);
      if (nestedHit !== undefined) return nestedHit;
    }
  }

  const rootGroup = employee[groupId];
  const rootGroupHit = readFromObject(rootGroup as Record<string, unknown>, keys);
  if (rootGroupHit !== undefined) return rootGroupHit;

  for (const [bucketKey, bucket] of Object.entries(employee)) {
    if (SKIP_NESTED_BUCKETS.has(bucketKey)) continue;
    const nestedHit = readFromObject(bucket as Record<string, unknown>, keys);
    if (nestedHit !== undefined) return nestedHit;
  }

  return undefined;
}
