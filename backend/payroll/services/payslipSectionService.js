/**
 * Build payslip display sections (attendance / earnings / deductions) from payroll config output columns.
 */
const outputColumnService = require('./outputColumnService');
const { payrollRecordToPayslipShape } = require('../utils/paysheetBundleExport');

const VALID_SECTIONS = new Set(['none', 'attendance', 'earnings', 'deductions']);

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

  if (!Array.isArray(outputColumns) || outputColumns.length === 0) {
    return empty();
  }

  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const tagged = sorted.filter((col) => resolvePayslipSection(col) !== 'none');
  if (tagged.length === 0) {
    return empty();
  }

  const payslip = payrollRecordToPayslipShape(record);
  const plainSnapshot =
    snapshotRow && typeof snapshotRow === 'object' && !Array.isArray(snapshotRow) ? snapshotRow : null;
  const computedRow =
    plainSnapshot && Object.keys(plainSnapshot).length > 0
      ? plainSnapshot
      : outputColumnService.buildRowFromOutputColumns(payslip, sorted);

  for (const col of sorted) {
    const section = resolvePayslipSection(col);
    if (section === 'none') continue;

    const header = (col.header && String(col.header).trim()) ? String(col.header).trim() : 'Column';
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
  buildPayslipSections,
};
