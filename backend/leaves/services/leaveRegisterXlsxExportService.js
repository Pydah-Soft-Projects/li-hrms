/**
 * Leave register Excel: one worksheet per leave type (casual / compensatory / earned).
 */

const XLSX = require('xlsx');
const { collectPeriodColumns } = require('./leaveRegisterPdfExportService');

function findRegisterMonth(entry, period) {
  return (entry.registerMonths || []).find(
    (r) => Number(r.month) === Number(period.month) && Number(r.year) === Number(period.year)
  );
}

function cellNum(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n - Math.round(n)) < 0.001) return Math.round(n);
  return Math.round(n * 100) / 100;
}

/** Policy-only credited days (matches on-screen register “Cr”). */
function policyCredited(rm, kind) {
  if (!rm) return '';
  if (kind === 'cl') {
    if (rm.policyScheduledCl != null && Number.isFinite(Number(rm.policyScheduledCl))) {
      return cellNum(rm.policyScheduledCl);
    }
    const ti = Number(rm.cl?.transferIn) || 0;
    if (rm.scheduledCl != null && Number.isFinite(Number(rm.scheduledCl))) {
      return cellNum(Math.max(0, Number(rm.scheduledCl) - ti));
    }
    return cellNum(rm.scheduledCl);
  }
  if (kind === 'ccl') {
    if (rm.policyScheduledCco != null && Number.isFinite(Number(rm.policyScheduledCco))) {
      return cellNum(rm.policyScheduledCco);
    }
    const ti = Number(rm.ccl?.transferIn) || 0;
    if (rm.scheduledCco != null && Number.isFinite(Number(rm.scheduledCco))) {
      return cellNum(Math.max(0, Number(rm.scheduledCco) - ti));
    }
    return cellNum(rm.scheduledCco);
  }
  if (kind === 'el') {
    if (rm.policyScheduledEl != null && Number.isFinite(Number(rm.policyScheduledEl))) {
      return cellNum(rm.policyScheduledEl);
    }
    const ti = Number(rm.el?.transferIn) || 0;
    if (rm.scheduledEl != null && Number.isFinite(Number(rm.scheduledEl))) {
      return cellNum(Math.max(0, Number(rm.scheduledEl) - ti));
    }
    return cellNum(rm.scheduledEl);
  }
  return '';
}

const SHEET_NAMES = {
  CL: 'Casual leave',
  CCL: 'Compensatory leave',
  EL: 'Earned leave',
};

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
  const sortedEntries = [...entries].sort((a, b) => {
    const na = (a.employee?.name || '').toLowerCase();
    const nb = (b.employee?.name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  const aboutRows = [
    ['Leave register — Excel export'],
    [''],
    ...filterSummaryParts.map((line) => [line]),
    [''],
    [
      'The next sheets are one tab per leave type (only types you selected). Each row is an employee. For every payroll month there are three columns: credited (policy-scheduled days only; carry-in from a prior period is excluded), taken (days used), balance (closing balance). All figures are days.',
    ],
  ];
  const wsAbout = XLSX.utils.aoa_to_sheet(aboutRows);
  wsAbout['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsAbout, 'About export');

  const buildHeader = () => {
    const h = ['#', 'Employee name', 'Staff no.', 'Department'];
    for (const p of periods) {
      const lbl = p.label || `${p.month}/${p.year}`;
      h.push(`${lbl} — credited`);
      h.push(`${lbl} — taken`);
      h.push(`${lbl} — balance`);
    }
    return h;
  };

  const appendTypeSheet = (key, predicate, rowSlice) => {
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
        const [c, u, b] = rowSlice(rm);
        row.push(c, u, b);
      }
      rows.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colWidths = [{ wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 22 }];
    for (let c = 0; c < periods.length * 3; c++) colWidths.push({ wch: 11 });
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  };

  appendTypeSheet('CL', includeCL, (rm) => {
    if (!rm) return ['', '', ''];
    return [policyCredited(rm, 'cl'), cellNum(rm.cl?.used), cellNum(rm.clBalance)];
  });

  appendTypeSheet('CCL', includeCCL, (rm) => {
    if (!rm) return ['', '', ''];
    return [policyCredited(rm, 'ccl'), cellNum(rm.ccl?.used), cellNum(rm.cclBalance)];
  });

  appendTypeSheet('EL', includeEL, (rm) => {
    if (!rm) return ['', '', ''];
    return [policyCredited(rm, 'el'), cellNum(rm.el?.used), cellNum(rm.elBalance)];
  });

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  buildLeaveRegisterXlsxBuffer,
};
