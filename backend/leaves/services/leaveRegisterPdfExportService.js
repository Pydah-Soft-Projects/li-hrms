/**
 * A4 landscape PDF for leave register grid (employees × payroll months × selected leave types).
 * Colour-coded sections for casual, compensatory, and earned leave.
 */

const PDFDocument = require('pdfkit');

const MARGIN = 28;
const COL_SN = 22;
const COL_NAME = 100;
const COL_EMP_NO = 48;
const COL_DEPT = 88;
const LEFT_TOTAL = COL_SN + COL_NAME + COL_EMP_NO + COL_DEPT;

const MONTHS_PER_PAGE = 4;

/** @type {{ monthBar: string; monthBarText: string; leftHeaderFill: string; leftHeaderStroke: string; empStripeA: string; empStripeB: string; empStroke: string; }} */
const PALETTE = {
  monthBar: '#4F46E5',
  monthBarText: '#FFFFFF',
  leftHeaderFill: '#E2E8F0',
  leftHeaderStroke: '#64748B',
  empStripeA: '#F8FAFC',
  empStripeB: '#FFFFFF',
  empStroke: '#CBD5E1',
};

const CL_STYLE = {
  subFill: '#DBEAFE',
  stroke: '#1D4ED8',
  bodyFill: '#EFF6FF',
};

const CCL_STYLE = {
  subFill: '#D1FAE5',
  stroke: '#047857',
  bodyFill: '#ECFDF5',
};

const EL_STYLE = {
  subFill: '#EDE9FE',
  stroke: '#5B21B6',
  bodyFill: '#F5F3FF',
};

function fmtCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }
  return String(v);
}

/** Policy-only “credited” days (excludes transfer-in from prior period / FY). */
function fmtPolicyCredits(rm, kind) {
  if (!rm) return '—';
  if (kind === 'cl') {
    if (rm.policyScheduledCl != null && Number.isFinite(Number(rm.policyScheduledCl))) {
      return fmtCell(rm.policyScheduledCl);
    }
    const ti = Number(rm.cl?.transferIn) || 0;
    const s = rm.scheduledCl;
    if (s != null && Number.isFinite(Number(s))) return fmtCell(Math.max(0, Number(s) - ti));
    return fmtCell(s);
  }
  if (kind === 'ccl') {
    if (rm.policyScheduledCco != null && Number.isFinite(Number(rm.policyScheduledCco))) {
      return fmtCell(rm.policyScheduledCco);
    }
    const ti = Number(rm.ccl?.transferIn) || 0;
    const s = rm.scheduledCco;
    if (s != null && Number.isFinite(Number(s))) return fmtCell(Math.max(0, Number(s) - ti));
    return fmtCell(s);
  }
  if (kind === 'el') {
    if (rm.policyScheduledEl != null && Number.isFinite(Number(rm.policyScheduledEl))) {
      return fmtCell(rm.policyScheduledEl);
    }
    const ti = Number(rm.el?.transferIn) || 0;
    const s = rm.scheduledEl;
    if (s != null && Number.isFinite(Number(s))) return fmtCell(Math.max(0, Number(s) - ti));
    return fmtCell(s);
  }
  return '—';
}

/**
 * @param {boolean} includeCL
 * @param {boolean} includeCCL
 * @param {boolean} includeEL
 */
function buildColumnLayout(includeCL, includeCCL, includeEL) {
  /** @type {{ header: string; groupStyle: typeof CL_STYLE; extract: (rm: any) => string }[]} */
  const cols = [];

  if (includeCL) {
    const g = CL_STYLE;
    cols.push(
      { header: 'Casual leave — credited', groupStyle: g, extract: (rm) => fmtPolicyCredits(rm, 'cl') },
      { header: 'Casual leave — taken', groupStyle: g, extract: (rm) => fmtCell(rm?.cl?.used) },
      { header: 'Casual leave — balance', groupStyle: g, extract: (rm) => fmtCell(rm?.clBalance) }
    );
  }
  if (includeCCL) {
    const g = CCL_STYLE;
    cols.push(
      { header: 'Compensatory leave — credited', groupStyle: g, extract: (rm) => fmtPolicyCredits(rm, 'ccl') },
      { header: 'Compensatory leave — taken', groupStyle: g, extract: (rm) => fmtCell(rm?.ccl?.used) },
      { header: 'Compensatory leave — balance', groupStyle: g, extract: (rm) => fmtCell(rm?.cclBalance) }
    );
  }
  if (includeEL) {
    const g = EL_STYLE;
    cols.push(
      { header: 'Earned leave — credited', groupStyle: g, extract: (rm) => fmtCell(rm?.scheduledEl) },
      { header: 'Earned leave — taken', groupStyle: g, extract: (rm) => fmtCell(rm?.el?.used) },
      { header: 'Earned leave — balance', groupStyle: g, extract: (rm) => fmtCell(rm?.elBalance) }
    );
  }
  return cols;
}

function collectPeriodColumns(entries) {
  const map = new Map();
  for (const e of entries) {
    for (const rm of e.registerMonths || []) {
      if (rm?.month == null || rm?.year == null) continue;
      const k = `${rm.year}-${rm.month}`;
      if (!map.has(k)) {
        map.set(k, {
          month: Number(rm.month),
          year: Number(rm.year),
          payPeriodStart: rm.payPeriodStart,
          label: rm.label || `${rm.month}/${rm.year}`,
        });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      new Date(a.payPeriodStart || `${a.year}-${a.month}-15`).getTime() -
      new Date(b.payPeriodStart || `${b.year}-${b.month}-15`).getTime()
  );
}

function findRegisterMonth(entry, period) {
  return (entry.registerMonths || []).find(
    (r) => Number(r.month) === Number(period.month) && Number(r.year) === Number(period.year)
  );
}

function rowValuesForLayout(entry, period, columnLayout) {
  const rm = findRegisterMonth(entry, period);
  if (!rm) return columnLayout.map(() => '—');
  return columnLayout.map((c) => c.extract(rm));
}

function drawFilterLine(doc, parts, y, innerW) {
  doc.font('Helvetica').fontSize(8).fillColor('#374151');
  const t = parts.filter(Boolean).join('  ·  ');
  doc.text(t || 'No extra filters', MARGIN, y, {
    width: innerW,
    align: 'left',
  });
  return doc.y + 6;
}

function fillStrokeRect(doc, x, y, w, h, fillHex, strokeHex, lineW = 0.35) {
  doc.save();
  doc.lineWidth(lineW);
  if (fillHex) {
    doc.fillColor(fillHex).rect(x, y, w, h).fill();
  }
  if (strokeHex) {
    doc.strokeColor(strokeHex).rect(x, y, w, h).stroke();
  }
  doc.restore();
}

/**
 * @param {object} params
 * @param {boolean} [params.includeCL]
 * @param {boolean} [params.includeCCL]
 * @param {boolean} [params.includeEL]
 */
function streamLeaveRegisterPdf({
  entries,
  financialYear,
  filterSummaryParts,
  outStream,
  includeCL = true,
  includeCCL = true,
  includeEL = true,
}) {
  const columnLayout = buildColumnLayout(!!includeCL, !!includeCCL, !!includeEL);
  const subColCount = columnLayout.length;
  if (subColCount === 0) {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape' });
    doc.pipe(outStream);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#991B1B').text('Leave register', 50, 50, { align: 'center' });
    doc.font('Helvetica').fontSize(10).text('No leave types selected. Choose at least one of casual, compensatory, or earned leave.', {
      align: 'center',
    });
    doc.end();
    return;
  }

  const doc = new PDFDocument({
    margin: MARGIN,
    size: 'A4',
    layout: 'landscape',
    bufferPages: true,
  });
  doc.pipe(outStream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const innerW = pageWidth - MARGIN * 2;

  const periodCols = collectPeriodColumns(entries);
  const sortedEntries = [...entries].sort((a, b) => {
    const na = (a.employee?.name || '').toLowerCase();
    const nb = (b.employee?.name || '').toLowerCase();
    return na.localeCompare(nb);
  });

  const includedLegendParts = [];
  if (includeCL) includedLegendParts.push('blue shading: casual leave');
  if (includeCCL) includedLegendParts.push('green shading: compensatory leave');
  if (includeEL) includedLegendParts.push('violet shading: earned leave');

  let pageIndex = 0;
  const drawLegend = (ly) => {
    doc.font('Helvetica').fontSize(7).fillColor('#1f2937');
    let legend =
      'Legend: All figures are in days. “Credited” is policy-scheduled days for that payroll month (credits carried in from a prior period or FY are excluded). “Taken” is leave used in that month. “Balance” is the closing balance at month end. ';
    legend += `Colour bands: ${includedLegendParts.join('; ')}.`;
    doc.text(legend, MARGIN, ly, { width: innerW, align: 'left' });
  };

  if (periodCols.length === 0) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e293b').text('Leave register', MARGIN, MARGIN, {
      align: 'center',
      width: innerW,
    });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('No payroll months found for this financial year and filter.', {
      align: 'center',
      width: innerW,
    });
    drawLegend(doc.y + 10);
    doc.end();
    return;
  }

  const headerMonthH = 16;
  const headerSubH = 38;
  const headerTotalH = headerMonthH + headerSubH;

  const drawMultiRowHeader = (chunk, y0) => {
    let x = MARGIN;
    fillStrokeRect(doc, x, y0, COL_SN, headerTotalH, PALETTE.leftHeaderFill, PALETTE.leftHeaderStroke);
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#0f172a');
    doc.text('#', x + 2, y0 + headerTotalH / 2 - 4, { width: COL_SN - 4, align: 'center' });
    x += COL_SN;
    fillStrokeRect(doc, x, y0, COL_NAME, headerTotalH, PALETTE.leftHeaderFill, PALETTE.leftHeaderStroke);
    doc.text('Employee name', x + 2, y0 + headerTotalH / 2 - 4, { width: COL_NAME - 4, align: 'center' });
    x += COL_NAME;
    fillStrokeRect(doc, x, y0, COL_EMP_NO, headerTotalH, PALETTE.leftHeaderFill, PALETTE.leftHeaderStroke);
    doc.text('Staff no.', x + 2, y0 + headerTotalH / 2 - 4, { width: COL_EMP_NO - 4, align: 'center' });
    x += COL_EMP_NO;
    fillStrokeRect(doc, x, y0, COL_DEPT, headerTotalH, PALETTE.leftHeaderFill, PALETTE.leftHeaderStroke);
    doc.text('Department', x + 2, y0 + headerTotalH / 2 - 4, { width: COL_DEPT - 4, align: 'center' });
    x += COL_DEPT;

    const monthBandW = (innerW - LEFT_TOTAL) / chunk.length;
    const cellW = monthBandW / subColCount;

    for (const p of chunk) {
      fillStrokeRect(doc, x, y0, monthBandW, headerMonthH, PALETTE.monthBar, '#4338CA', 0.5);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PALETTE.monthBarText);
      doc.text(p.label || `${p.month}/${p.year}`, x + 2, y0 + 4, {
        width: monthBandW - 4,
        align: 'center',
      });
      let sx = x;
      for (let s = 0; s < subColCount; s++) {
        const col = columnLayout[s];
        const g = col.groupStyle;
        fillStrokeRect(doc, sx, y0 + headerMonthH, cellW, headerSubH, g.subFill, g.stroke, 0.35);
        doc.font('Helvetica-Bold').fontSize(4.9).fillColor('#0f172a');
        doc.text(col.header, sx + 1, y0 + headerMonthH + 2, {
          width: cellW - 2,
          align: 'center',
          lineGap: 0.4,
        });
        sx += cellW;
      }
      x += monthBandW;
    }
    return headerTotalH;
  };

  for (let c = 0; c < periodCols.length; c += MONTHS_PER_PAGE) {
    const chunk = periodCols.slice(c, c + MONTHS_PER_PAGE);
    const monthBandW = (innerW - LEFT_TOTAL) / chunk.length;
    const cellW = monthBandW / subColCount;

    if (pageIndex > 0) doc.addPage();
    pageIndex += 1;

    let y = MARGIN;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#312E81').text('Leave register (summary)', MARGIN, y, {
      width: innerW,
      align: 'center',
    });
    y = doc.y + 4;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#4F46E5').text(`Financial year: ${financialYear || '—'}`, MARGIN, y, {
      width: innerW,
      align: 'center',
    });
    y = doc.y + 6;
    y = drawFilterLine(doc, filterSummaryParts, y, innerW);

    y += 4;
    const hDrawn = drawMultiRowHeader(chunk, y);
    y += hDrawn;

    doc.font('Helvetica').fontSize(6.5).fillColor('#111827');

    const rowH = 15;
    const maxY = pageHeight - MARGIN - 56;

    let rowNum = 0;
    sortedEntries.forEach((entry, entryIndex) => {
      if (y + rowH > maxY) {
        drawLegend(maxY + 2);
        doc.addPage();
        pageIndex += 1;
        y = MARGIN;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#3730A3').text(
          `Leave register (continued — ${financialYear || ''})`,
          MARGIN,
          y,
          { width: innerW, align: 'center' }
        );
        y = doc.y + 10;
        drawMultiRowHeader(chunk, y);
        y += headerTotalH;
        doc.font('Helvetica').fontSize(6.5).fillColor('#111827');
      }

      rowNum += 1;
      const stripeFill = entryIndex % 2 === 0 ? PALETTE.empStripeA : PALETTE.empStripeB;
      let x = MARGIN;

      fillStrokeRect(doc, x, y, COL_SN, rowH, stripeFill, PALETTE.empStroke);
      doc.fillColor('#111827').text(String(rowNum), x + 2, y + 4, { width: COL_SN - 4, align: 'center' });
      x += COL_SN;
      fillStrokeRect(doc, x, y, COL_NAME, rowH, stripeFill, PALETTE.empStroke);
      doc.text(entry.employee?.name || '—', x + 2, y + 3, { width: COL_NAME - 4, align: 'left', ellipsis: true });
      x += COL_NAME;
      fillStrokeRect(doc, x, y, COL_EMP_NO, rowH, stripeFill, PALETTE.empStroke);
      doc.text(String(entry.employee?.empNo || '—'), x + 2, y + 4, { width: COL_EMP_NO - 4, align: 'left', ellipsis: true });
      x += COL_EMP_NO;
      fillStrokeRect(doc, x, y, COL_DEPT, rowH, stripeFill, PALETTE.empStroke);
      doc.text(String(entry.employee?.department || '—'), x + 2, y + 3, { width: COL_DEPT - 4, align: 'left', ellipsis: true });
      x += COL_DEPT;

      for (const p of chunk) {
        const vals = rowValuesForLayout(entry, p, columnLayout);
        let sx = x;
        for (let s = 0; s < subColCount; s++) {
          const col = columnLayout[s];
          const bodyFill = col.groupStyle.bodyFill;
          fillStrokeRect(doc, sx, y, cellW, rowH, bodyFill, col.groupStyle.stroke, 0.25);
          doc.fillColor('#111827').text(vals[s], sx + 1, y + 4, { width: cellW - 2, align: 'center' });
          sx += cellW;
        }
        x += monthBandW;
      }
      y += rowH;
    });

    drawLegend(Math.min(y + 6, maxY + 4));
  }

  doc.end();
}

module.exports = {
  streamLeaveRegisterPdf,
  collectPeriodColumns,
  buildColumnLayout,
};
