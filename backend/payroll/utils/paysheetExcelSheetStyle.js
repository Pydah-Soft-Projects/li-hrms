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
    numFmt: '#,##0.##',
  },
  dataNumberAlt: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F8FAFC' }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '#,##0.##',
  },
  dataText: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '@',
  },
  dataTextAlt: {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F8FAFC' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '@',
  },
  aggregateTotalText: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '78350F' } },
    fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '@',
  },
  aggregateTotalNumber: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '78350F' } },
    fill: { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
    numFmt: '#,##0.##',
  },
};

/** Headers that must stay plain text in Excel (no numeric coercion / comma grouping). */
function normalizeHeaderKey(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const TEXT_COLUMN_HEADER_KEYS = new Set([
  'employeecode',
  'employeenumber',
  'employeeno',
  'empno',
  'empnumber',
  'staffno',
  'staffnumber',
  'eno',
  'pfnumber',
  'pfno',
  'esinumber',
  'esino',
  'uannumber',
  'uanno',
  'pannumber',
  'panno',
  'bankaccountno',
  'bankaccountnumber',
  'accountno',
  'acno',
  'ifsc',
  'ifsccode',
]);

function isTextColumnHeader(header) {
  const key = normalizeHeaderKey(header);
  if (!key) return false;
  if (TEXT_COLUMN_HEADER_KEYS.has(key)) return true;
  if (key.includes('employeecode') || key.includes('employeenumber')) return true;
  if (key.includes('empno') || key.includes('staffno')) return true;
  if (key.includes('bankaccount') || key.includes('accountno') || key.includes('acno')) return true;
  if (key.includes('ifsc')) return true;
  if (key.includes('pfno') || key.includes('pfnumber')) return true;
  if (key.includes('esinumber') || key.includes('esino')) return true;
  if (key.includes('uannumber') || key.includes('uanno')) return true;
  if (key.includes('pannumber') || key.includes('panno')) return true;
  return false;
}

function headerRowForDataRow(r, colHeaderRows, singleHeaderRow) {
  if (Array.isArray(colHeaderRows) && colHeaderRows.length) {
    let best = -1;
    for (const hr of colHeaderRows) {
      if (hr < r && hr > best) best = hr;
    }
    if (best >= 0) return best;
    return colHeaderRows[0];
  }
  return singleHeaderRow != null ? singleHeaderRow : null;
}

function buildColumnHeaderMap(ws, colCount, headerRowIndices) {
  const map = new Map();
  for (const hr of headerRowIndices) {
    if (hr == null || hr < 0) continue;
    for (let c = 0; c < colCount; c += 1) {
      const header = getCellText(ws, hr, c);
      if (header) map.set(c, header);
    }
  }
  return map;
}

function forceCellAsText(cell) {
  if (!cell) return;
  if (cell.v == null || cell.v === '') {
    cell.t = 's';
    cell.v = '';
    return;
  }
  cell.t = 's';
  cell.v = String(cell.v);
}

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

function isAggregateTotalRow(ws, r, cEnd) {
  for (let c = 0; c <= cEnd; c += 1) {
    const v = getCellText(ws, r, c).toUpperCase();
    if (
      v.startsWith('DEPARTMENT TOTAL') ||
      v.startsWith('DIVISION TOTAL') ||
      v.startsWith('GRAND TOTAL')
    ) {
      return true;
    }
  }
  return false;
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
  const headerRowIndices =
    opts.colHeaderRows?.length
      ? opts.colHeaderRows
      : opts.headerRowIndex != null
        ? [opts.headerRowIndex]
        : [];
  const headerRowSet = new Set(headerRowIndices);
  const colHeaderStyle = opts.variant === 'bank' ? STYLES.colHeaderBank : STYLES.colHeader;
  const columnHeaderMap = buildColumnHeaderMap(ws, colCount, headerRowIndices);

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

    if (isAggregateTotalRow(ws, r, cEnd)) {
      const sectionHeaderRow = headerRowForDataRow(r, headerRowIndices, opts.headerRowIndex);
      for (let c = 0; c <= cEnd; c += 1) {
        const ref = cellRef(r, c);
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        const cell = ws[ref];
        const colHeader =
          (sectionHeaderRow != null ? getCellText(ws, sectionHeaderRow, c) : '') ||
          columnHeaderMap.get(c) ||
          '';
        const asText = isTextColumnHeader(colHeader);
        if (asText) {
          forceCellAsText(cell);
          cell.s = { ...STYLES.aggregateTotalText };
          continue;
        }
        const numeric = cell.t === 'n' || isNumericValue(cell.v);
        if (numeric && c > 0) {
          if (typeof cell.v === 'string' && cell.v.trim() !== '') cell.v = Number(cell.v);
          cell.t = 'n';
          cell.s = { ...STYLES.aggregateTotalNumber };
        } else if (cell.v != null && String(cell.v).trim() !== '') {
          forceCellAsText(cell);
          cell.s = { ...STYLES.aggregateTotalText };
        } else {
          cell.s = { ...STYLES.aggregateTotalNumber };
        }
      }
      rowHeights[r] = { hpt: 20 };
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
    const sectionHeaderRow = headerRowForDataRow(r, headerRowIndices, opts.headerRowIndex);
    for (let c = 0; c <= cEnd; c += 1) {
      const ref = cellRef(r, c);
      if (!ws[ref]) ws[ref] = { t: 's', v: '' };
      const cell = ws[ref];
      const colHeader =
        (sectionHeaderRow != null ? getCellText(ws, sectionHeaderRow, c) : '') ||
        columnHeaderMap.get(c) ||
        '';
      const asText = isTextColumnHeader(colHeader);

      if (asText) {
        forceCellAsText(cell);
        cell.s = { ...(alt ? STYLES.dataTextAlt : STYLES.dataText) };
        continue;
      }

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
  isTextColumnHeader,
  normalizeHeaderKey,
};
