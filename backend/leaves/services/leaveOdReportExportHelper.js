/**
 * Leave / OD application report export helpers (PDF multi-header + Excel).
 */

const dayjs = require('dayjs');
const LeaveSettings = require('../model/LeaveSettings');

const FIXED_HEADERS = [
  'S.No',
  'EC No.',
  'Name of the Employee',
  'Designation',
  'Division',
  'Department',
  'Group',
  'Leave Type',
  'From Date',
  'To Date',
  'No. of Days',
  'Applied Date',
];

const FIXED_COL_WIDTHS = [26, 48, 90, 62, 62, 44, 78, 28, 46];
const OD_FIXED_COL_WIDTHS = [48, 90, 62, 62, 44, 52, 60, 60, 40, 40, 46];

function toDisplayCase(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function formatAppliedDate(value) {
  if (!value) return '-';
  return dayjs(value).format('DD/MM/YYYY');
}

function formatStageCell(step) {
  if (!step) return '-';
  const status = String(step.status || 'pending').toLowerCase();
  const statusDisplay = toDisplayCase(status) || 'Pending';
  if (!status || status === 'pending') return statusDisplay;
  const userName = step.actionByName || step.actionByRole || '-';
  const dateTime = step.updatedAt ? dayjs(step.updatedAt).format('DD/MM/YYYY HH:mm') : (step.actionDate ? dayjs(step.actionDate).format('DD/MM/YYYY HH:mm') : '');
  return [statusDisplay, userName, dateTime].filter(Boolean).join('\n');
}

function getCellAlign(colIndex, stageCount, isOd = false) {
  if (isOd) {
    if (colIndex === 1) return 'left'; // Name of Employee
    if (colIndex >= 2 && colIndex <= 5) return 'left'; // Designation, Division, Department, Group
    return 'center';
  }
  const fixedCount = FIXED_HEADERS.length;
  const statusCol = fixedCount + stageCount;
  const remarksCol = statusCol + 1;
  if (colIndex <= 2) return 'left';
  if (colIndex >= fixedCount && colIndex < statusCol) return 'left';
  if (colIndex === statusCol) return 'center';
  if (colIndex === remarksCol) return 'left';
  return 'center';
}

function getMaxApprovalStageCount(items) {
  let max = 0;
  for (const item of items || []) {
    const len = Array.isArray(item.workflow?.approvalChain) ? item.workflow.approvalChain.length : 0;
    if (len > max) max = len;
  }
  return max;
}

async function resolveExportStageMeta(items, settingsType) {
  let stageCount = getMaxApprovalStageCount(items);
  let settingsSteps = [];

  try {
    const settings = await LeaveSettings.getActiveSettings(settingsType);
    settingsSteps = (settings?.workflow?.steps || [])
      .slice()
      .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
    if (stageCount === 0 && settingsSteps.length > 0) {
      stageCount = settingsSteps.length;
    }
  } catch {
    /* ignore */
  }

  stageCount = Math.max(stageCount, 1);

  const stageLabels = [];
  for (let i = 0; i < stageCount; i++) {
    let label = `Stage${i + 1}`;
    if (settingsType !== 'od') {
      label = settingsSteps[i]?.stepName || settingsSteps[i]?.approverRole || `Stage ${i + 1}`;
    }
    for (const item of items || []) {
      const step = item.workflow?.approvalChain?.[i];
      if (step?.label && String(step.label).trim()) {
        label = String(step.label).trim();
        break;
      }
      if (step?.role && String(step.role).trim() && settingsType !== 'od') {
        label = toDisplayCase(step.role);
        break;
      }
    }
    stageLabels.push(String(label).trim() || `Stage${i + 1}`);
  }

  return { stageCount, stageLabels };
}

function buildStageColumnWidths(stageCount, pageWidth = 782, isOd = false) {
  if (isOd) {
    const fixedTotal = OD_FIXED_COL_WIDTHS.reduce((a, b) => a + b, 0);
    const remaining = pageWidth - fixedTotal;
    const stageWidth = Math.max(48, Math.floor(remaining / Math.max(stageCount, 1)));
    let colWidths = [...OD_FIXED_COL_WIDTHS, ...Array(stageCount).fill(stageWidth)];
    const total = colWidths.reduce((a, b) => a + b, 0);
    if (total > pageWidth) {
      const factor = pageWidth / total;
      colWidths = colWidths.map((w) => Math.max(22, Math.floor(w * factor)));
    }
    return colWidths;
  }
  const fixedTotal = FIXED_COL_WIDTHS.reduce((a, b) => a + b, 0);
  const statusWidth = 44;
  const remarksWidth = 55;
  const remaining = pageWidth - fixedTotal - statusWidth - remarksWidth;
  const stageWidth = Math.max(45, Math.floor(remaining / Math.max(stageCount, 1)));
  let colWidths = [...FIXED_COL_WIDTHS, ...Array(stageCount).fill(stageWidth), statusWidth, remarksWidth];
  const total = colWidths.reduce((a, b) => a + b, 0);
  if (total > pageWidth) {
    const factor = pageWidth / total;
    colWidths = colWidths.map((w) => Math.max(20, Math.floor(w * factor)));
  }
  return colWidths;
}

function buildStageHeaderConfig(stageCount, stageLabels, isOd = false) {
  if (isOd) {
    const mainHeaders = [
      { label: 'EC No.', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Name of the Employee', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Designation', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Division', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Department', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Group', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'OD Type', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'First Half/Second Half/Time OD', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'Time OD', colSpan: 2, bgColor: '#1e3a5f', textColor: '#ffffff' },
      { label: 'Applied Date', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
      { label: 'approved date', colSpan: stageCount, bgColor: '#1e3a5f', textColor: '#ffffff' },
    ];

    const subHeaders = [
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      { label: 'From', colSpan: 1, bgColor: '#e0e7ff', textColor: '#312e81' },
      { label: 'To', colSpan: 1, bgColor: '#e0e7ff', textColor: '#312e81' },
      { label: '', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
      ...stageLabels.map((label) => ({ label, colSpan: 1, bgColor: '#e0e7ff', textColor: '#312e81' })),
    ];

    return { mainHeaders, subHeaders };
  }

  const mainHeaders = [
    ...FIXED_HEADERS.map((label) => ({ label, colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' })),
    { label: 'Date of Approved', colSpan: stageCount, bgColor: '#1e3a5f', textColor: '#ffffff' },
    { label: 'Status', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
    { label: 'Remarks', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
  ];

  const subHeaders = [
    ...FIXED_HEADERS.map((label) => ({ label, colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' })),
    ...stageLabels.map((label) => ({ label, colSpan: 1, bgColor: '#e0e7ff', textColor: '#312e81' })),
    { label: 'Status', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
    { label: 'Remarks', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
  ];

  return { mainHeaders, subHeaders };
}

function getOdSlotType(item) {
  if (item.odType_extended === 'hours' || item.odStartTime || item.odEndTime) {
    return 'Time OD';
  }
  if (item.isHalfDay) {
    if (item.halfDayType === 'first_half') return 'First Half';
    if (item.halfDayType === 'second_half') return 'Second Half';
    return 'Half Day';
  }
  return 'Full Day';
}

function buildApplicationDetailRow(item, options) {
  const {
    isOd,
    stageCount,
    rowIndex,
    formatDate,
    getCleanEmpName,
  } = options;

  const row = [
    rowIndex + 1,
    emp.emp_no || item.emp_no || '-',
    getCleanEmpName(emp),
    designationName,
    divisionName,
    departmentName,
    groupName,
    isOd ? String(item.odType || '').replace(/_/g, ' ') : item.leaveType || 'General',
    formatDate(item.fromDate),
    formatDate(item.toDate),
    item.numberOfDays ?? 0,
    formatAppliedDate(item.createdAt),
  ];

  const chain = item.workflow?.approvalChain || [];
  for (let i = 0; i < stageCount; i++) {
    row.push(formatStageCell(chain[i]));
  }
  row.push(String(item.status || '').toUpperCase());
  row.push(item.reason || item.remarks || item.comments || '-');
  return row;
}

function drawMultiHeaderPdfTable(doc, headerConfig, rows, startX, startY, colWidths, options = {}) {
  const {
    fontSize = 6.5,
    minRowHeight = 22,
    rowFill = '#f8fafc',
    alternateRowFill = '#ffffff',
    cellPaddingX = 3,
    cellPaddingY = 3,
    lineBreak = true,
    stageCount = Math.max(1, colWidths.length - FIXED_HEADERS.length - 1),
  } = options;

  let y = startY;
  const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
  const threshold = doc.page.height - 55;
  const borderColor = '#cbd5e1';

  const drawHeaderRows = () => {
    let x = startX;
    let colOffset = 0;
    headerConfig.mainHeaders.forEach((headerObj) => {
      const colSpan = headerObj.colSpan || 1;
      const headerWidth = colWidths.slice(colOffset, colOffset + colSpan).reduce((a, b) => a + b, 0);
      doc.fillColor(headerObj.bgColor || '#2980b9').rect(x, y, headerWidth, 18).fill();
      doc.strokeColor(borderColor).lineWidth(0.5).rect(x, y, headerWidth, 18).stroke();
      doc.fillColor(headerObj.textColor || '#ffffff').font('Helvetica-Bold').fontSize(fontSize);
      doc.text(String(headerObj.label), x + cellPaddingX, y + 5, {
        width: Math.max(1, headerWidth - cellPaddingX * 2),
        align: 'center',
        lineBreak: false,
      });
      x += headerWidth;
      colOffset += colSpan;
    });
    y += 18;

    if (headerConfig.subHeaders?.length) {
      x = startX;
      headerConfig.subHeaders.forEach((headerObj, colIndex) => {
        const colSpan = headerObj.colSpan || 1;
        const headerWidth = colWidths.slice(colIndex, colIndex + colSpan).reduce((a, b) => a + b, 0);
        doc.fillColor(headerObj.bgColor || '#dbeafe').rect(x, y, headerWidth, 16).fill();
        doc.strokeColor(borderColor).lineWidth(0.5).rect(x, y, headerWidth, 16).stroke();
        doc.fillColor(headerObj.textColor || '#1e3a5f').font('Helvetica-Bold').fontSize(fontSize - 0.5);
        if (headerObj.label) {
          doc.text(String(headerObj.label), x + cellPaddingX, y + 3, {
            width: Math.max(1, headerWidth - cellPaddingX * 2),
            align: 'center',
            lineBreak: false,
          });
        }
        x += headerWidth;
      });
      y += 16;
    }

    doc.font('Helvetica').fontSize(fontSize).fillColor('#334155');
  };

  drawHeaderRows();

  rows.forEach((row, rowIndex) => {
    let rowHeight = minRowHeight;
    if (lineBreak) {
      row.forEach((cell, index) => {
        const h = doc.heightOfString(String(cell ?? ''), {
          width: Math.max(1, colWidths[index] - cellPaddingX * 2),
          align: getCellAlign(index, stageCount, isOd),
        });
        rowHeight = Math.max(rowHeight, h + cellPaddingY * 2);
      });
    }

    if (y + rowHeight > threshold) {
      doc.addPage();
      y = 50;
      drawHeaderRows();
    }

    const bgColor = rowIndex % 2 === 0 ? rowFill : alternateRowFill;
    doc.fillColor(bgColor).rect(startX, y, tableWidth, rowHeight).fill();

    let x = startX;
    row.forEach((cell, index) => {
      const colWidth = colWidths[index];
      doc.strokeColor(borderColor).lineWidth(0.5).rect(x, y, colWidth, rowHeight).stroke();
      doc.fillColor('#334155').font('Helvetica').fontSize(fontSize);
      doc.text(String(cell ?? ''), x + cellPaddingX, y + cellPaddingY, {
        width: Math.max(1, colWidth - cellPaddingX * 2),
        align: getCellAlign(index, stageCount, isOd),
        lineBreak,
      });
      x += colWidth;
    });

    y += rowHeight;
  });

  return y;
}

function calculateExcelColumnWidths(aoa, stageCount) {
  const maxCols = Math.max(...aoa.map((row) => (row ? row.length : 0)));
  const minWidths = [
    8,   // S.No
    14,  // EC No.
    28,  // Name of the Employee
    24,  // Designation
    22,  // Division
    22,  // Department
    18,  // Group
    16,  // Leave Type
    14,  // From Date
    14,  // To Date
    14,  // No. of Days
    15,  // Applied Date
  ];

  for (let i = 0; i < stageCount; i++) {
    minWidths.push(26);
  }
  minWidths.push(16); // Status
  minWidths.push(32); // Remarks

  const cols = [];
  for (let col = 0; col < maxCols; col++) {
    let maxLen = minWidths[col] || 15;
    for (let r = 3; r < aoa.length; r++) {
      const cell = aoa[r]?.[col];
      if (cell !== undefined && cell !== null) {
        const lines = String(cell).split('\n');
        for (const line of lines) {
          if (line.length > maxLen) {
            maxLen = line.length;
          }
        }
      }
    }
    cols.push({ wch: Math.min(Math.max(maxLen + 3, minWidths[col] || 12), 55) });
  }
  return cols;
}

function calculateExcelRowHeights(aoa) {
  const rows = [];
  for (let r = 0; r < aoa.length; r++) {
    if (r === 0) {
      rows.push({ hpt: 28 });
    } else if (r === 1) {
      rows.push({ hpt: 22 });
    } else if (r === 2) {
      rows.push({ hpt: 10 });
    } else if (r === 3) {
      rows.push({ hpt: 24 });
    } else if (r === 4) {
      rows.push({ hpt: 20 });
    } else {
      const row = aoa[r] || [];
      let maxLines = 1;
      for (const cell of row) {
        if (cell) {
          const lines = String(cell).split('\n').length;
          if (lines > maxLines) maxLines = lines;
        }
      }
      rows.push({ hpt: Math.max(20, maxLines * 15) });
    }
  }
  return rows;
}

function buildExcelSheetAoA(title, periodLine, dataRows, stageCount, stageLabels, isOd = false, orgName = '') {
  const titleRows = [];
  if (orgName) titleRows.push([orgName]);
  if (title) titleRows.push([title]);
  if (periodLine) titleRows.push([periodLine]);

  if (isOd) {
    const fixedHeaders = [
      'EC No.',
      'Name of the Employee',
      'Designation',
      'Division',
      'Department',
      'Group',
      'OD Type',
      'First Half/Second Half/Time OD',
    ];
    const mainHeaderRow = [
      ...fixedHeaders,
      'Time OD',
      '',
      'Applied Date',
      'approved date',
    ];
    for (let i = 1; i < stageCount; i++) mainHeaderRow.push('');

    const subHeaderRow = [
      '', '', '', '', '', '', '', '',
      'From',
      'To',
      '',
      ...stageLabels,
    ];

    const aoa = [...titleRows, mainHeaderRow, subHeaderRow, ...dataRows];
    const rOffset = titleRows.length;

    const totalCols = fixedHeaders.length + 2 + 1 + stageCount;
    const merges = [];
    titleRows.forEach((_, idx) => {
      merges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: totalCols - 1 } });
    });

    for (let c = 0; c < fixedHeaders.length; c++) {
      merges.push({ s: { r: rOffset, c }, e: { r: rOffset + 1, c } });
    }
    merges.push({ s: { r: rOffset, c: 8 }, e: { r: rOffset, c: 9 } }); // Time OD (From, To)
    merges.push({ s: { r: rOffset, c: 10 }, e: { r: rOffset + 1, c: 10 } }); // Applied Date
    if (stageCount >= 1) {
      merges.push({ s: { r: rOffset, c: 11 }, e: { r: rOffset, c: 11 + stageCount - 1 } }); // approved date stages
    }

    const cols = calculateExcelColumnWidths(aoa, stageCount);
    const rows = calculateExcelRowHeights(aoa);

    return { aoa, merges, cols, rows };
  }

  const fixedCount = FIXED_HEADERS.length;
  const stageStart = fixedCount;
  const statusCol = fixedCount + stageCount;
  const remarksCol = statusCol + 1;

  const mainHeaderRow = [...FIXED_HEADERS];
  mainHeaderRow.push('Date of Approved');
  for (let i = 1; i < stageCount; i++) mainHeaderRow.push('');
  mainHeaderRow.push('Status');
  mainHeaderRow.push('Remarks');

  const subHeaderRow = [...FIXED_HEADERS, ...stageLabels, 'Status', 'Remarks'];

  const aoa = [...titleRows, mainHeaderRow, subHeaderRow, ...dataRows];
  const rOffset = titleRows.length;

  const merges = [];
  titleRows.forEach((_, idx) => {
    merges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: remarksCol } });
  });

  for (let c = 0; c < fixedCount; c++) {
    merges.push({ s: { r: rOffset, c }, e: { r: rOffset + 1, c } });
  }
  if (stageCount >= 1) {
    merges.push({ s: { r: rOffset, c: stageStart }, e: { r: rOffset, c: stageStart + stageCount - 1 } });
  }
  merges.push({ s: { r: rOffset, c: statusCol }, e: { r: rOffset + 1, c: statusCol } });
  merges.push({ s: { r: rOffset, c: remarksCol }, e: { r: rOffset + 1, c: remarksCol } });

  const cols = calculateExcelColumnWidths(aoa, stageCount);
  const rows = calculateExcelRowHeights(aoa);

  return { aoa, merges, cols, rows };
}

module.exports = {
  FIXED_HEADERS,
  OD_FIXED_COL_WIDTHS,
  formatAppliedDate,
  formatStageCell,
  resolveExportStageMeta,
  buildStageColumnWidths,
  buildStageHeaderConfig,
  buildApplicationDetailRow,
  drawMultiHeaderPdfTable,
  buildExcelSheetAoA,
};

