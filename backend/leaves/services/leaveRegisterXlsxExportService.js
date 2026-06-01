/**
 * Leave register Excel: one worksheet per leave type (casual / compensatory / earned).
 * Grid columns match LeaveRegisterPage: Cr, Carried in, Used, Transfer, Bal.
 */

const XLSX = require('xlsx');
const { collectPeriodColumns } = require('./leaveRegisterPdfExportService');
const { compareEmpNo } = require('../../shared/utils/employeeSort');
const {
  registerRowSlice,
} = require('./leaveRegisterExportShared');

function findRegisterMonth(entry, period) {
  return (entry.registerMonths || []).find(
    (r) => Number(r.month) === Number(period.month) && Number(r.year) === Number(period.year)
  );
}

const SHEET_NAMES = {
  CL: 'Casual leave',
  CCL: 'Compensatory leave',
  EL: 'Earned leave',
};

const PERIOD_SUBCOLS = ['Cr', 'Carried in', 'Used', 'Transfer', 'Bal'];

/**
 * @param {object} p
 * @param {any[]} p.entries
 * @param {string[]} p.filterSummaryParts
 * @param {boolean} p.includeCL
 * @param {boolean} p.includeCCL
 * @param {boolean} p.includeEL
 * @returns {Buffer}
 */
function buildLeaveRegisterXlsxBuffer({
  entries,
  filterSummaryParts,
  includeCL,
  includeCCL,
  includeEL,
}) {
  const wb = XLSX.utils.book_new();
  const periods = collectPeriodColumns(entries);
  const sortedEntries = [...entries].sort((a, b) =>
    compareEmpNo(a.employee?.empNo ?? a.employee?.emp_no, b.employee?.empNo ?? b.employee?.emp_no)
  );

  const aboutRows = [
    ['Leave register — Excel export'],
    [''],
    ...filterSummaryParts.map((line) => [line]),
    [''],
    [
      'Each sheet is one leave type. Each row is an employee. For every payroll month there are five columns matching the on-screen register: Cr (policy-scheduled credits), Carried in (transfer from prior period), Used (approved debits plus pending lock), Transfer (credits moved to next period), Bal (Cr + Carried in − Used − Transfer). All figures are days.',
    ],
  ];
  const wsAbout = XLSX.utils.aoa_to_sheet(aboutRows);
  wsAbout['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsAbout, 'About export');

  const buildHeader = () => {
    const h = ['#', 'Employee name', 'Staff no.', 'Department'];
    for (const p of periods) {
      const lbl = p.label || `${p.month}/${p.year}`;
      for (const sub of PERIOD_SUBCOLS) {
        h.push(`${lbl} — ${sub}`);
      }
    }
    return h;
  };

  const appendTypeSheet = (key, predicate, kind) => {
    if (!predicate) return;
    const name = SHEET_NAMES[key];
    const safeName = name.length > 31 ? name.slice(0, 31) : name;
    const header = buildHeader();
    /** @type {(string|number)[][]} */
    const rows = [header];
    sortedEntries.forEach((entry, i) => {
      /** @type {(string|number)[]} */
      const row = [
        i + 1,
        entry.employee?.name || '',
        entry.employee?.empNo != null ? String(entry.employee.empNo) : '',
        entry.employee?.department || '',
      ];
      for (const p of periods) {
        const rm = findRegisterMonth(entry, p);
        row.push(...registerRowSlice(rm, kind));
      }
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 22 }];
    for (let c = 0; c < periods.length * PERIOD_SUBCOLS.length; c++) colWidths.push({ wch: 10 });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  };

  appendTypeSheet('CL', includeCL, 'cl');
  appendTypeSheet('CCL', includeCCL, 'ccl');
  appendTypeSheet('EL', includeEL, 'el');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  buildLeaveRegisterXlsxBuffer,
};
