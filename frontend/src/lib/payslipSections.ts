import type { PayrollOutputColumn } from '@/lib/api';

export type PayslipSectionType = 'none' | 'attendance' | 'earnings' | 'deductions';

export interface PayslipSectionItem {
  header: string;
  value: string | number;
  order?: number;
}

export interface PayslipSections {
  attendance: PayslipSectionItem[];
  earnings: PayslipSectionItem[];
  deductions: PayslipSectionItem[];
  hasConfiguredSections: boolean;
  /** Sum of all earnings-assigned column values */
  totalEarnings?: number;
  /** Sum of all deductions-assigned column values */
  totalDeductions?: number;
  /** totalEarnings − totalDeductions */
  netPayable?: number;
}

export function sumSectionNumericItems(items: PayslipSectionItem[]): number {
  return items.reduce((acc, item) => {
    const n = typeof item.value === 'number' ? item.value : Number(item.value);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

export function withSectionTotals(sections: PayslipSections): PayslipSections {
  const totalEarnings = sumSectionNumericItems(sections.earnings);
  const totalDeductions = sumSectionNumericItems(sections.deductions);
  return {
    ...sections,
    totalEarnings,
    totalDeductions,
    netPayable: totalEarnings - totalDeductions,
  };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatInrPdf(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const VALID_SECTIONS = new Set<PayslipSectionType>(['none', 'attendance', 'earnings', 'deductions']);

export function inferPayslipSectionFromField(field?: string): PayslipSectionType {
  const path = String(field || '').trim();
  if (!path) return 'none';
  if (path.startsWith('attendance.')) return 'attendance';
  if (path.startsWith('earnings.') || path.startsWith('arrears.')) return 'earnings';
  if (
    path.startsWith('deductions.') ||
    path.startsWith('loanAdvance.') ||
    path.startsWith('manualDeductions')
  ) {
    return 'deductions';
  }
  return 'none';
}

/**
 * Payslip shows ONLY columns explicitly tagged in payroll config.
 * Field-path inference is not used at render time (avoids paysheet-only columns leaking in).
 */
export function resolvePayslipSection(col: PayrollOutputColumn): PayslipSectionType {
  const section = String(col.payslipSection || 'none').trim().toLowerCase() as PayslipSectionType;
  if (section === 'attendance' || section === 'earnings' || section === 'deductions') return section;
  return 'none';
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function payrollRecordToPayslipShape(record: Record<string, unknown>) {
  const emp = (record.employeeId || {}) as Record<string, unknown>;
  const rawAtt = (record.attendance || {}) as Record<string, unknown>;
  const ded = (record.deductions || {}) as Record<string, unknown>;
  const attBreakdown = (ded.attendanceDeductionBreakdown || {}) as Record<string, unknown>;
  const daysFromBreakdown = num(attBreakdown.daysDeducted, NaN);
  const attendanceDeductionDays = Number.isFinite(daysFromBreakdown)
    ? daysFromBreakdown
    : num(rawAtt.attendanceDeductionDays);
  const elUsedInPayroll = num(rawAtt.elUsedInPayroll ?? record.elUsedInPayroll);
  const dept = emp.department_id as { name?: string } | string | undefined;
  const desig = emp.designation_id as { name?: string } | string | undefined;
  const loanAdvance = (record.loanAdvance || {}) as Record<string, unknown>;
  const earnings = (record.earnings || {}) as Record<string, unknown>;
  const arrearsAmount = num((record.arrears as { arrearsAmount?: number } | undefined)?.arrearsAmount ?? record.arrearsAmount);
  const manualDeductionsAmount = num(
    (record.manualDeductions as { manualDeductionsAmount?: number } | undefined)?.manualDeductionsAmount ??
      record.manualDeductionsAmount
  );

  return {
    employee: {
      emp_no: String(record.emp_no || emp.emp_no || ''),
      name: String(emp.employee_name || ''),
      designation: typeof desig === 'object' ? desig?.name || '' : String(desig || ''),
      department: typeof dept === 'object' ? dept?.name || '' : String(dept || ''),
      bank_account_no: emp.bank_account_no != null ? String(emp.bank_account_no) : '',
      payment_mode: String(emp.salary_mode || ''),
      salary_mode: String(emp.salary_mode || ''),
    },
    attendance: { ...rawAtt, elUsedInPayroll, attendanceDeductionDays },
    elUsedInPayroll,
    attendanceDeductionDays,
    earnings,
    deductions: ded,
    loanAdvance,
    arrears: { arrearsAmount },
    manualDeductions: { manualDeductionsAmount },
    manualDeductionsAmount,
    arrearsAmount,
    netSalary: num(record.netSalary),
    roundOff: num(record.roundOff),
  };
}

function getValueByPath(obj: Record<string, unknown>, path: string): string | number {
  if (!path) return '';
  const trimmed = path.trim();
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0) {
    const basePath = trimmed.slice(0, colonIdx).trim();
    const key = trimmed.slice(colonIdx + 1).trim();
    if (basePath === 'earnings.allowanceAmount') {
      const allowances = (obj.earnings as { allowances?: Array<{ name?: string; amount?: number }> })?.allowances;
      const item = allowances?.find((a) => a && String(a.name).trim() === key);
      return item?.amount ?? 0;
    }
    if (basePath === 'deductions.otherDeductionAmount') {
      const other = (obj.deductions as { otherDeductions?: Array<{ name?: string; amount?: number }> })?.otherDeductions;
      const item = other?.find((d) => d && String(d.name).trim() === key);
      return item?.amount ?? 0;
    }
    if (basePath === 'deductions.statutoryAmount') {
      const statutory = (obj.deductions as {
        statutoryDeductions?: Array<{ code?: string; name?: string; employeeAmount?: number }>;
      })?.statutoryDeductions;
      const item = statutory?.find(
        (s) => s && (String(s.code).trim() === key || String(s.name).trim() === key)
      );
      return item?.employeeAmount ?? 0;
    }
  }

  const parts = trimmed.split('.').filter(Boolean);
  let val: unknown = obj;
  for (const p of parts) {
    if (val == null || typeof val !== 'object') return '';
    val = (val as Record<string, unknown>)[p];
  }
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') return val;
  if (typeof val === 'object') return '';
  return String(val);
}

function headerToKey(header: string): string {
  if (!header) return '';
  return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';
}

const DEFAULT_STATUTORY_CODES = ['PF', 'ESI', 'PT'];

function isAllowancesCumulativeColumn(col: PayrollOutputColumn): boolean {
  const field = String(col.field || '').trim();
  const headerKey = headerToKey(col.header || '');
  return (
    field === 'earnings.allowancesCumulative'
    || headerKey === 'allowances_cumulative'
    || headerKey === 'total_allowances'
  );
}

function isDeductionsCumulativeColumn(col: PayrollOutputColumn): boolean {
  const field = String(col.field || '').trim();
  const headerKey = headerToKey(col.header || '');
  return field === 'deductions.deductionsCumulative' || headerKey === 'deductions_cumulative';
}

function isStatutoryCumulativeColumn(col: PayrollOutputColumn): boolean {
  const field = String(col.field || '').trim();
  const headerKey = headerToKey(col.header || '');
  return (
    field === 'deductions.statutoryCumulative'
    || headerKey === 'statutory_cumulative'
    || headerKey === 'statutory_deductions'
  );
}

function expandOutputColumnsWithBreakdown(
  outputColumns: PayrollOutputColumn[],
  allAllowanceNames: string[] = [],
  allDeductionNames: string[] = [],
  allStatutoryCodes: string[] = []
): PayrollOutputColumn[] {
  if (!outputColumns.length) return [];

  const allowances = [...allAllowanceNames].sort((a, b) => String(a).localeCompare(String(b)));
  const deductions = [...allDeductionNames].sort((a, b) => String(a).localeCompare(String(b)));
  const statutoryOrder = ['PF', 'ESI', 'PT'];
  const statutory = [...allStatutoryCodes].sort((a, b) => {
    const ia = statutoryOrder.indexOf(String(a).toUpperCase());
    const ib = statutoryOrder.indexOf(String(b).toUpperCase());
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return String(a).localeCompare(String(b));
  });

  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const expanded: PayrollOutputColumn[] = [];
  const seenHeaders = new Set<string>();
  let nextOrder = 0;

  function uniqueHeader(header: string, order: number) {
    const h = header?.trim() ? header.trim() : `Column ${order}`;
    if (h === 'Column' || seenHeaders.has(h)) {
      const unique = `Column ${order}`;
      seenHeaders.add(unique);
      return unique;
    }
    seenHeaders.add(h);
    return h;
  }

  for (const col of sorted) {
    if (isAllowancesCumulativeColumn(col)) {
      allowances.forEach((name) => {
        if (!name) return;
        expanded.push({
          header: String(name).trim(),
          source: 'field',
          field: `earnings.allowanceAmount:${String(name).trim()}`,
          formula: '',
          order: nextOrder++,
        });
      });
    }
    if (isDeductionsCumulativeColumn(col)) {
      deductions.forEach((name) => {
        if (!name) return;
        expanded.push({
          header: String(name).trim(),
          source: 'field',
          field: `deductions.otherDeductionAmount:${String(name).trim()}`,
          formula: '',
          order: nextOrder++,
        });
      });
    }
    if (isStatutoryCumulativeColumn(col)) {
      statutory.forEach((code) => {
        if (!code) return;
        expanded.push({
          header: String(code).trim(),
          source: 'field',
          field: `deductions.statutoryAmount:${String(code).trim()}`,
          formula: '',
          order: nextOrder++,
        });
      });
    }
    const order = nextOrder++;
    expanded.push({
      ...col,
      header: uniqueHeader(col.header || '', order),
      order,
    });
  }

  return expanded;
}

function collectBreakdownSetsFromRecord(record: Record<string, unknown>) {
  const payslip = payrollRecordToPayslipShape(record);
  const allAllowanceNames = new Set<string>();
  const allDeductionNames = new Set<string>();
  const allStatutoryCodes = new Set<string>();

  const allowances = (payslip.earnings as { allowances?: Array<{ name?: string }> })?.allowances || [];
  allowances.forEach((a) => {
    if (a?.name) allAllowanceNames.add(String(a.name).trim());
  });

  const otherDeductions = (payslip.deductions as { otherDeductions?: Array<{ name?: string }> })?.otherDeductions || [];
  otherDeductions.forEach((d) => {
    if (d?.name) allDeductionNames.add(String(d.name).trim());
  });

  const statutory = (payslip.deductions as {
    statutoryDeductions?: Array<{ code?: string; name?: string }>;
  })?.statutoryDeductions || [];
  statutory.forEach((s) => {
    if (s?.code || s?.name) allStatutoryCodes.add(String(s.code || s.name).trim());
  });
  DEFAULT_STATUTORY_CODES.forEach((c) => allStatutoryCodes.add(c));

  return { payslip, allAllowanceNames, allDeductionNames, allStatutoryCodes };
}

function resolveParentCumulativeSections(outputColumns: PayrollOutputColumn[]) {
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const parentSections: Record<'allowances' | 'deductions' | 'statutory', PayslipSectionType> = {
    allowances: 'none',
    deductions: 'none',
    statutory: 'none',
  };
  for (const col of sorted) {
    if (isAllowancesCumulativeColumn(col)) parentSections.allowances = resolvePayslipSection(col);
    if (isDeductionsCumulativeColumn(col)) parentSections.deductions = resolvePayslipSection(col);
    if (isStatutoryCumulativeColumn(col)) parentSections.statutory = resolvePayslipSection(col);
  }
  return parentSections;
}

function buildPayslipDisplayColumns(
  outputColumns: PayrollOutputColumn[],
  record: Record<string, unknown>
): Array<PayrollOutputColumn & { payslipSection?: PayslipSectionType }> {
  if (!outputColumns.length) return [];

  const { allAllowanceNames, allDeductionNames, allStatutoryCodes } = collectBreakdownSetsFromRecord(record);
  const parentSections = resolveParentCumulativeSections(outputColumns);
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const expanded = expandOutputColumnsWithBreakdown(
    sorted,
    [...allAllowanceNames],
    [...allDeductionNames],
    [...allStatutoryCodes]
  );

  const showAllowanceBreakdown =
    parentSections.allowances !== 'none' && allAllowanceNames.size > 0;
  const showDeductionBreakdown =
    parentSections.deductions !== 'none' && allDeductionNames.size > 0;
  const showStatutoryBreakdown = parentSections.statutory !== 'none';

  const displayColumns: Array<PayrollOutputColumn & { payslipSection?: PayslipSectionType }> = [];

  for (const col of expanded) {
    const field = String(col.field || '').trim();

    if (isAllowancesCumulativeColumn(col)) {
      if (showAllowanceBreakdown) continue;
      if (resolvePayslipSection(col) === 'none') continue;
      displayColumns.push(col);
      continue;
    }
    if (isDeductionsCumulativeColumn(col)) {
      if (showDeductionBreakdown) continue;
      if (resolvePayslipSection(col) === 'none') continue;
      displayColumns.push(col);
      continue;
    }
    if (isStatutoryCumulativeColumn(col)) {
      if (showStatutoryBreakdown) continue;
      if (resolvePayslipSection(col) === 'none') continue;
      displayColumns.push(col);
      continue;
    }

    if (field.startsWith('earnings.allowanceAmount:')) {
      if (parentSections.allowances === 'none') continue;
      displayColumns.push({ ...col, payslipSection: parentSections.allowances });
      continue;
    }
    if (field.startsWith('deductions.otherDeductionAmount:')) {
      if (parentSections.deductions === 'none') continue;
      displayColumns.push({ ...col, payslipSection: parentSections.deductions });
      continue;
    }
    if (field.startsWith('deductions.statutoryAmount:')) {
      if (parentSections.statutory === 'none') continue;
      displayColumns.push({ ...col, payslipSection: parentSections.statutory });
      continue;
    }

    if (resolvePayslipSection(col) === 'none') continue;
    displayColumns.push(col);
  }

  return displayColumns;
}

function getContextFromPayslip(payslip: ReturnType<typeof payrollRecordToPayslipShape>) {
  const att = (payslip.attendance || {}) as Record<string, unknown>;
  const earn = (payslip.earnings || {}) as Record<string, unknown>;
  const ded = (payslip.deductions || {}) as Record<string, unknown>;
  const loan = (payslip.loanAdvance || {}) as Record<string, unknown>;
  return {
    basicPay: num(earn.basicPay),
    grossSalary: num(earn.grossSalary),
    netSalary: num(payslip.netSalary),
    totalDeductions: num((ded as { totalDeductions?: number }).totalDeductions),
    roundOff: num(payslip.roundOff),
    presentDays: num(att.presentDays),
    payableShifts: num(att.payableShifts),
    monthDays: num(att.totalDaysInMonth, 30),
    otPay: num(earn.otPay),
    incentive: num(earn.incentive),
    advanceDeduction: num(loan.advanceDeduction),
    loanEMI: num(loan.totalEMI),
    earnedSalary: num(att.earnedSalary),
    allowancesCumulative: num(earn.allowancesCumulative ?? earn.totalAllowances),
    deductionsCumulative: num((ded as { deductionsCumulative?: number }).deductionsCumulative ?? ded.totalDeductions),
    statutoryCumulative: num((ded as { statutoryCumulative?: number }).statutoryCumulative),
    attendanceDeduction: num(ded.attendanceDeduction),
    permissionDeduction: num(ded.permissionDeduction),
    arrearsAmount: num(payslip.arrearsAmount),
    arrears: num(payslip.arrearsAmount),
  };
}

function safeEvalFormula(formula: string, context: Record<string, number>): number {
  if (!formula?.trim()) return 0;
  try {
    const keys = Object.keys(context);
    const values = keys.map((k) => context[k] ?? 0);
    const fn = new Function('Math', ...keys, `return (${formula});`);
    const result = fn(Math, ...values);
    return typeof result === 'number' && !Number.isNaN(result) ? result : 0;
  } catch {
    return 0;
  }
}

function buildRowFromOutputColumns(
  payslip: ReturnType<typeof payrollRecordToPayslipShape>,
  outputColumns: PayrollOutputColumn[]
): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const columnContext: Record<string, number> = { ...getContextFromPayslip(payslip) };
  const usedHeaders = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const col = sorted[i];
    let header = col.header?.trim() || 'Column';
    if (header === 'Column' || usedHeaders.has(header)) header = `Column ${i}`;
    usedHeaders.add(header);

    const hasFormula = typeof col.formula === 'string' && col.formula.trim().length > 0;
    const val = hasFormula
      ? safeEvalFormula(col.formula!, columnContext)
      : getValueByPath(payslip as Record<string, unknown>, col.field || '');
    row[header] = val;
    const key = headerToKey(header);
    if (key) columnContext[key] = typeof val === 'number' ? val : num(val);
  }
  return row;
}

export function buildPayslipSections(
  outputColumns: PayrollOutputColumn[],
  record: object,
  snapshotRow?: Record<string, string | number> | null
): PayslipSections {
  const attendance: PayslipSectionItem[] = [];
  const earnings: PayslipSectionItem[] = [];
  const deductions: PayslipSectionItem[] = [];

  if (!Array.isArray(outputColumns) || outputColumns.length === 0) {
    return { attendance, earnings, deductions, hasConfiguredSections: false };
  }

  const recordObj = record as Record<string, unknown>;
  const displayColumns = buildPayslipDisplayColumns(outputColumns, recordObj);
  if (displayColumns.length === 0) {
    return { attendance, earnings, deductions, hasConfiguredSections: false };
  }

  const { payslip, allAllowanceNames, allDeductionNames, allStatutoryCodes } =
    collectBreakdownSetsFromRecord(recordObj);
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const expandedForRow = expandOutputColumnsWithBreakdown(
    sorted,
    [...allAllowanceNames],
    [...allDeductionNames],
    [...allStatutoryCodes]
  );

  const computedRow =
    snapshotRow && Object.keys(snapshotRow).length > 0
      ? snapshotRow
      : buildRowFromOutputColumns(payslip, expandedForRow);

  for (const col of displayColumns) {
    const section = col.payslipSection || resolvePayslipSection(col);
    if (section === 'none') continue;

    const header = col.header?.trim() || 'Column';
    let value: string | number = computedRow[header] ?? '';
    if (value === '' && col.source === 'field' && col.field) {
      value = getValueByPath(payslip as Record<string, unknown>, col.field);
    }

    const item: PayslipSectionItem = { header, value, order: col.order };
    if (section === 'attendance') attendance.push(item);
    else if (section === 'earnings') earnings.push(item);
    else deductions.push(item);
  }

  return withSectionTotals({
    attendance,
    earnings,
    deductions,
    hasConfiguredSections: attendance.length + earnings.length + deductions.length > 0,
  });
}

export function formatSectionValue(
  value: string | number,
  section: PayslipSectionType,
  asCurrency = false
): string {
  if (value === '' || value === null || value === undefined) return '—';
  if (section === 'attendance' && !asCurrency) {
    if (typeof value === 'number') return String(value);
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : String(value);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) {
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

export function formatSectionValuePdf(
  value: string | number,
  section: PayslipSectionType
): string {
  if (value === '' || value === null || value === undefined) return '—';
  if (section === 'attendance') {
    if (typeof value === 'number') return String(value);
    const n = Number(value);
    return Number.isFinite(n) ? String(n) : String(value);
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) {
    return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

export const PAYSLIP_SECTION_OPTIONS: { value: PayslipSectionType; label: string }[] = [
  { value: 'none', label: 'Paysheet only (not on payslip)' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'deductions', label: 'Deductions' },
];

export function sectionsToPdfTableBody(
  items: PayslipSectionItem[],
  section: PayslipSectionType
): string[][] {
  return items.map((item) => [item.header, formatSectionValuePdf(item.value, section)]);
}

export function sectionsToPdfAttendanceLine(items: PayslipSectionItem[]): string {
  return items
    .map((item) => `${item.header}: ${formatSectionValuePdf(item.value, 'attendance')}`)
    .join('    |    ');
}
