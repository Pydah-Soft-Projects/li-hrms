/**
 * Excel cell styling for paysheet bundle export (xlsx-js-style).
 */

const XLSX = require('xlsx-js-style');

const BORDER_THIN = { style: 'thin', color: { rgb: 'CBD5E1' } };
const BORDER_ALL = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

const STYLES = {
  companyTitle: {
    font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  salaryKind: {
    font: { name: 'Calibri', sz: 13, bold: true, color: { rgb: '312E81' } },
    fill: { fgColor: { rgb: 'E0E7FF' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  metaLine: {
    font: { name: 'Calibri', sz: 11, color: { rgb: '334155' } },
    fill: { fgColor: { rgb: 'F1F5F9' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  bankTitle: {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F766E' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  colHeader: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4F46E5' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER_ALL,
  },
  colHeaderBank: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F766E' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER_ALL,
  },
  divBanner: {
    font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E40AF' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  deptBanner: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '64748B' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  },
  data: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    alignment: { vertical: 'center', wrapText: false },
    border: BORDER_ALL,
  },
  dataAlt: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F8FAFC' }, patternType: 'solid' },
    alignment: { vertical: 'center', wrapText: false },
    border: BORDER_ALL,
  },
  dataNumber: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '#,##0.00',
  },
  dataNumberAlt: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F8FAFC' }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '#,##0.00',
  },
};

function cellRef(r, c) {
  return XLSX.utils.encode_cell({ r, c });
}

function getCellText(ws, r, c) {
  const cell = ws[cellRef(r, c)];
  if (!cell) return '';
  return String(cell.v ?? '').trim();
}

function isNumericValue(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return true;
  return false;
}

function applyRowStyle(ws, r, cEnd, style) {
  for (let c = 0; c <= cEnd; c += 1) {
    const ref = cellRef(r, c);
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = { ...style };
  }
}

function isSalaryKindRow(ws, r) {
  const v = getCellText(ws, r, 0).toUpperCase();
  return v.includes('SALARY') && !v.startsWith('DIVISION:') && !v.startsWith('DEPARTMENT:');
}

function isMetaBannerRow(ws, r) {
  const v = getCellText(ws, r, 0);
  if (!v) return false;
  return (
    v.startsWith('Division:') ||
    v.startsWith('Divisions') ||
    v.startsWith('Pay period:') ||
    v.startsWith('Department') ||
    v.startsWith('Designation:') ||
    v.startsWith('Employee group:') ||
    v.startsWith('Employment status:') ||
    v.startsWith('Search:') ||
    v.startsWith('BANK CANDIDATES')
  );
}

function isDivisionBannerRow(ws, r) {
  return getCellText(ws, r, 0).toUpperCase().startsWith('DIVISION:');
}

function isDepartmentBannerRow(ws, r) {
  return getCellText(ws, r, 0).toUpperCase().startsWith('DEPARTMENT:');
}

/**
 * @param {import('xlsx-js-style').WorkSheet} ws
 * @param {Object} opts
 * @param {number} opts.colCount
 * @param {number} [opts.headerRowIndex] - single table header row (combined / bank)
 * @param {number[]} [opts.colHeaderRows] - multiple header rows (by department sections)
 * @param {'paysheet'|'bank'} [opts.variant]
 */
function applyPaysheetWorksheetStyles(ws, opts) {
  if (!ws || !opts?.colCount) return ws;
  const colCount = Math.max(opts.colCount, 1);
  const cEnd = colCount - 1;
  const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: cEnd } };
  const totalRows = range.e.r + 1;
  const headerRowSet = new Set(
    opts.colHeaderRows?.length
      ? opts.colHeaderRows
      : opts.headerRowIndex != null
        ? [opts.headerRowIndex]
        : []
  );
  const colHeaderStyle = opts.variant === 'bank' ? STYLES.colHeaderBank : STYLES.colHeader;

  const rowHeights = [];
  let dataRowCounter = 0;

  for (let r = 0; r < totalRows; r += 1) {
    const rowText = getCellText(ws, r, 0);

    if (r === 0) {
      applyRowStyle(ws, r, cEnd, opts.variant === 'bank' ? STYLES.bankTitle : STYLES.companyTitle);
      rowHeights[r] = { hpt: 30 };
      continue;
    }

    if (isSalaryKindRow(ws, r)) {
      applyRowStyle(ws, r, cEnd, STYLES.salaryKind);
      rowHeights[r] = { hpt: 24 };
      continue;
    }

    if (isMetaBannerRow(ws, r)) {
      applyRowStyle(ws, r, cEnd, STYLES.metaLine);
      rowHeights[r] = { hpt: 20 };
      continue;
    }

    if (isDivisionBannerRow(ws, r)) {
      applyRowStyle(ws, r, cEnd, STYLES.divBanner);
      rowHeights[r] = { hpt: 24 };
      continue;
    }

    if (isDepartmentBannerRow(ws, r)) {
      applyRowStyle(ws, r, cEnd, STYLES.deptBanner);
      rowHeights[r] = { hpt: 22 };
      continue;
    }

    if (headerRowSet.has(r)) {
      applyRowStyle(ws, r, cEnd, colHeaderStyle);
      rowHeights[r] = { hpt: 22 };
      dataRowCounter = 0;
      continue;
    }

    if (!rowText) {
      rowHeights[r] = { hpt: 8 };
      continue;
    }

    const alt = dataRowCounter % 2 === 1;
    dataRowCounter += 1;
    for (let c = 0; c <= cEnd; c += 1) {
      const ref = cellRef(r, c);
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];
      const numeric = cell.t === 'n' || isNumericValue(cell.v);
      if (numeric && c > 0) {
        if (typeof cell.v === 'string' && cell.v.trim() !== '') cell.v = Number(cell.v);
        cell.t = 'n';
        cell.s = { ...(alt ? STYLES.dataNumberAlt : STYLES.dataNumber) };
      } else {
        const base = alt ? STYLES.dataAlt : STYLES.data;
        cell.s = {
          ...base,
          alignment: { ...base.alignment, horizontal: c === 0 ? 'center' : 'left' },
        };
      }
    }
    rowHeights[r] = { hpt: 18 };
  }

  ws['!rows'] = rowHeights;
  if (opts.freezeAfterRow != null && opts.freezeAfterRow >= 0) {
    ws['!views'] = [{ state: 'frozen', ySplit: opts.freezeAfterRow + 1, activeCell: 'A1' }];
  }
  return ws;
}

function finalizeWorksheet(ws, merges, colWidths) {
  if (merges?.length) ws['!merges'] = merges;
  if (colWidths?.length) ws['!cols'] = colWidths;
  return ws;
}

function writeStyledWorkbook(wb) {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
}

module.exports = {
  XLSX,
  applyPaysheetWorksheetStyles,
  finalizeWorksheet,
  writeStyledWorkbook,
};
