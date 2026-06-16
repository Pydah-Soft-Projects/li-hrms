/**
 * Build payslip display sections (attendance / earnings / deductions) from payroll config output columns.
 * Cumulative columns (allowances, statutory, other deductions) expand into individual line items like the paysheet.
 */
const outputColumnService = require('./outputColumnService');
const { payrollRecordToPayslipShape } = require('../utils/paysheetBundleExport');

const VALID_SECTIONS = new Set(['none', 'attendance', 'earnings', 'deductions']);
const DEFAULT_STATUTORY_CODES = ['PF', 'ESI', 'PT'];

function inferPayslipSectionFromField(field) {
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

/** Payslip shows only columns explicitly tagged in payroll config. */
function resolvePayslipSection(col) {
  const section = String(col?.payslipSection || 'none').trim().toLowerCase();
  if (section === 'attendance' || section === 'earnings' || section === 'deductions') return section;
  return 'none';
}

function normalizeSectionValue(val) {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const n = Number(val);
  if (Number.isFinite(n) && String(val).trim() !== '') return n;
  return val;
}

function sumSectionNumericItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    const n = typeof item?.value === 'number' ? item.value : Number(item?.value);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function withSectionTotals(sections) {
  const totalEarnings = sumSectionNumericItems(sections.earnings);
  const totalDeductions = sumSectionNumericItems(sections.deductions);
  return {
    ...sections,
    totalEarnings,
    totalDeductions,
    netPayable: totalEarnings - totalDeductions,
  };
}

function collectBreakdownSetsFromRecord(record) {
  const payslip = payrollRecordToPayslipShape(record);
  const allAllowanceNames = new Set();
  const allDeductionNames = new Set();
  const allStatutoryCodes = new Set();

  (payslip?.earnings?.allowances || []).forEach((a) => {
    if (a?.name) allAllowanceNames.add(String(a.name).trim());
  });
  (payslip?.deductions?.otherDeductions || []).forEach((d) => {
    if (d?.name) allDeductionNames.add(String(d.name).trim());
  });
  (payslip?.deductions?.statutoryDeductions || []).forEach((s) => {
    if (s?.code || s?.name) allStatutoryCodes.add(String(s.code || s.name).trim());
  });
  DEFAULT_STATUTORY_CODES.forEach((c) => allStatutoryCodes.add(c));

  return { payslip, allAllowanceNames, allDeductionNames, allStatutoryCodes };
}

function resolveParentCumulativeSections(outputColumns) {
  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const parentSections = { allowances: 'none', deductions: 'none', statutory: 'none' };
  for (const col of sorted) {
    if (outputColumnService.isAllowancesCumulativeColumn(col)) {
      parentSections.allowances = resolvePayslipSection(col);
    }
    if (outputColumnService.isDeductionsCumulativeColumn(col)) {
      parentSections.deductions = resolvePayslipSection(col);
    }
    if (outputColumnService.isStatutoryCumulativeColumn(col)) {
      parentSections.statutory = resolvePayslipSection(col);
    }
  }
  return parentSections;
}

/**
 * Expand cumulative paysheet columns into breakdown lines for payslip (inherits parent payslipSection).
 */
function buildPayslipDisplayColumns(outputColumns, record) {
  const plainColumns = outputColumnService.toPlainOutputColumns(outputColumns);
  if (!plainColumns.length) return [];

  const { allAllowanceNames, allDeductionNames, allStatutoryCodes } = collectBreakdownSetsFromRecord(record);
  const parentSections = resolveParentCumulativeSections(plainColumns);
  const sorted = [...plainColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const expanded = outputColumnService.expandOutputColumnsWithBreakdown(
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

  const displayColumns = [];

  for (const col of expanded) {
    const field = String(col.field || '').trim();

    if (outputColumnService.isAllowancesCumulativeColumn(col)) {
      if (showAllowanceBreakdown) continue;
      if (resolvePayslipSection(col) === 'none') continue;
      displayColumns.push(col);
      continue;
    }
    if (outputColumnService.isDeductionsCumulativeColumn(col)) {
      if (showDeductionBreakdown) continue;
      if (resolvePayslipSection(col) === 'none') continue;
      displayColumns.push(col);
      continue;
    }
    if (outputColumnService.isStatutoryCumulativeColumn(col)) {
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

/**
 * @param {Object[]} outputColumns - payroll config output columns
 * @param {Object} record - PayrollRecord (mongoose doc or plain)
 * @param {Object|null} snapshotRow - frozen paysheet row { [header]: value }
 */
function buildPayslipSections(outputColumns, record, snapshotRow = null) {
  const attendance = [];
  const earnings = [];
  const deductions = [];

  const empty = () =>
    withSectionTotals({ attendance, earnings, deductions, hasConfiguredSections: false });

  const plainColumns = outputColumnService.toPlainOutputColumns(outputColumns);
  if (!plainColumns.length) {
    return empty();
  }

  const displayColumns = buildPayslipDisplayColumns(plainColumns, record);
  if (displayColumns.length === 0) {
    return empty();
  }

  const { payslip, allAllowanceNames, allDeductionNames, allStatutoryCodes } =
    collectBreakdownSetsFromRecord(record);
  const sorted = [...plainColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const expandedForRow = outputColumnService.expandOutputColumnsWithBreakdown(
    sorted,
    [...allAllowanceNames],
    [...allDeductionNames],
    [...allStatutoryCodes]
  );

  const plainSnapshot =
    snapshotRow && typeof snapshotRow === 'object' && !Array.isArray(snapshotRow) ? snapshotRow : null;
  const computedRow =
    plainSnapshot && Object.keys(plainSnapshot).length > 0
      ? plainSnapshot
      : outputColumnService.buildRowFromOutputColumns(payslip, expandedForRow);

  for (const col of displayColumns) {
    const section = col.payslipSection || resolvePayslipSection(col);
    if (section === 'none') continue;

    const header = col.header && String(col.header).trim() ? String(col.header).trim() : 'Column';
    let value = computedRow[header];
    if (value === undefined || value === '') {
      if (col.source === 'field' && col.field) {
        value = outputColumnService.getValueByPath(payslip, col.field);
      } else {
        value = '';
      }
    }

    const item = { header, value: normalizeSectionValue(value), order: col.order ?? 0 };
    if (section === 'attendance') attendance.push(item);
    else if (section === 'earnings') earnings.push(item);
    else if (section === 'deductions') deductions.push(item);
  }

  return withSectionTotals({
    attendance,
    earnings,
    deductions,
    hasConfiguredSections: attendance.length + earnings.length + deductions.length > 0,
  });
}

module.exports = {
  VALID_SECTIONS,
  inferPayslipSectionFromField,
  resolvePayslipSection,
  sumSectionNumericItems,
  withSectionTotals,
  buildPayslipDisplayColumns,
  buildPayslipSections,
};
