/**
 * Leave / OD application report export helpers (PDF multi-header + Excel).
 */

const dayjs = require('dayjs');
const LeaveSettings = require('../model/LeaveSettings');

const FIXED_HEADERS = [
  'S.No',
  'Emp ID',
  'Employee Name',
  'Division',
  'Department',
  'Type',
  'Dates',
  'Days',
  'Applied Date',
];

const FIXED_COL_WIDTHS = [26, 48, 90, 62, 62, 44, 78, 28, 46];

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
  const dateTime = step.updatedAt ? dayjs(step.updatedAt).format('DD/MM/YYYY HH:mm') : '';
  return [statusDisplay, userName, dateTime].filter(Boolean).join('\n');
}

function getCellAlign(colIndex, stageCount) {
  const fixedCount = FIXED_HEADERS.length;
  const statusCol = fixedCount + stageCount;
  if (colIndex <= 2) return 'left';
  if (colIndex >= fixedCount && colIndex < statusCol) return 'left';
  if (colIndex === statusCol) return 'center';
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
    let label = settingsSteps[i]?.stepName || settingsSteps[i]?.approverRole || `Stage ${i + 1}`;
    for (const item of items || []) {
      const step = item.workflow?.approvalChain?.[i];
      if (step?.label && String(step.label).trim()) {
        label = String(step.label).trim();
        break;
      }
      if (step?.role && String(step.role).trim()) {
        label = toDisplayCase(step.role);
        break;
      }
    }
    stageLabels.push(String(label).trim() || `Stage ${i + 1}`);
  }

  return { stageCount, stageLabels };
}

function buildStageColumnWidths(stageCount, pageWidth = 782) {
  const fixedTotal = FIXED_COL_WIDTHS.reduce((a, b) => a + b, 0);
  const statusWidth = 46;
  const remaining = pageWidth - fixedTotal - statusWidth;
  const stageWidth = Math.max(48, Math.floor(remaining / Math.max(stageCount, 1)));
  let colWidths = [...FIXED_COL_WIDTHS, ...Array(stageCount).fill(stageWidth), statusWidth];
  const total = colWidths.reduce((a, b) => a + b, 0);
  if (total > pageWidth) {
    const factor = pageWidth / total;
    colWidths = colWidths.map((w) => Math.max(22, Math.floor(w * factor)));
  }
  return colWidths;
}

function buildStageHeaderConfig(stageCount, stageLabels) {
  const mainHeaders = [
    ...FIXED_HEADERS.map((label) => ({ label, colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' })),
    { label: 'Stages', colSpan: stageCount, bgColor: '#1e3a5f', textColor: '#ffffff' },
    { label: 'Status', colSpan: 1, bgColor: '#2980b9', textColor: '#ffffff' },
  ];

  const subHeaders = [
    ...FIXED_HEADERS.map((label) => ({ label, colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' })),
    ...stageLabels.map((label) => ({ label, colSpan: 1, bgColor: '#e0e7ff', textColor: '#312e81' })),
    { label: 'Status', colSpan: 1, bgColor: '#dbeafe', textColor: '#1e3a5f' },
  ];

  return { mainHeaders, subHeaders };
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
    item.employeeId?.emp_no || '-',
    getCleanEmpName(item.employeeId),
    item.employeeId?.division?.name || '-',
    item.employeeId?.department?.name || '-',
    isOd ? String(item.odType || '').replace(/_/g, ' ') : item.leaveType,
    `${formatDate(item.fromDate)}${item.fromDate !== item.toDate ? ` - ${formatDate(item.toDate)}` : ''}`,
    item.numberOfDays,
    formatAppliedDate(item.createdAt),
  ];

  const chain = item.workflow?.approvalChain || [];
  for (let i = 0; i < stageCount; i++) {
    row.push(formatStageCell(chain[i]));
  }
  row.push(String(item.status || '').toUpperCase());
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
        doc.text(String(headerObj.label), x + cellPaddingX, y + 3, {
          width: Math.max(1, headerWidth - cellPaddingX * 2),
          align: 'center',
          lineBreak: false,
        });
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
          align: getCellAlign(index, stageCount),
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
        align: getCellAlign(index, stageCount),
        lineBreak,
      });
      x += colWidth;
    });

    y += rowHeight;
  });

  return y;
}

function buildExcelSheetAoA(title, periodLine, dataRows, stageCount, stageLabels) {
  const fixedCount = FIXED_HEADERS.length;
  const stageStart = fixedCount;
  const statusCol = fixedCount + stageCount;

  const mainHeaderRow = [...FIXED_HEADERS];
  mainHeaderRow.push('Stages');
  for (let i = 1; i < stageCount; i++) mainHeaderRow.push('');
  mainHeaderRow.push('Status');

  const subHeaderRow = [...FIXED_HEADERS, ...stageLabels, 'Status'];

  const aoa = [[title], [periodLine], mainHeaderRow, subHeaderRow, ...dataRows];

  const merges = [];
  for (let c = 0; c < fixedCount; c++) {
    merges.push({ s: { r: 2, c }, e: { r: 3, c } });
  }
  if (stageCount > 1) {
    merges.push({ s: { r: 2, c: stageStart }, e: { r: 2, c: stageStart + stageCount - 1 } });
  }
  merges.push({ s: { r: 2, c: statusCol }, e: { r: 3, c: statusCol } });

  return { aoa, merges };
}

module.exports = {
  FIXED_HEADERS,
  formatAppliedDate,
  formatStageCell,
  resolveExportStageMeta,
  buildStageColumnWidths,
  buildStageHeaderConfig,
  buildApplicationDetailRow,
  drawMultiHeaderPdfTable,
  buildExcelSheetAoA,
};
