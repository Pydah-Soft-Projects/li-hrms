import type jsPDF from 'jspdf';
import {
  pct,
  type OdOrgAggregateRow,
  type OdStatusBreakdown,
  type OdTrendPoint,
} from './odAuditStats';

type Rgb = [number, number, number];

const STATUS_COLORS: Record<string, Rgb> = {
  pending: [245, 158, 11],
  approved: [16, 185, 129],
  rejected: [239, 68, 68],
  cancelled: [148, 163, 184],
  other: [203, 213, 225],
};

const SEGMENT_COLORS: Record<string, Rgb> = {
  co: [139, 92, 246],
  hours: [14, 165, 233],
  regular: [100, 116, 139],
};

function pdfAscii(text: string): string {
  return String(text ?? '')
    .replace(/\u2192/g, '->')
    .replace(/[^\x00-\x7F]/g, '');
}

function ensureSpace(doc: jsPDF, y: number, needed: number, margin = 10): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin + 4;
  }
  return y;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, margin: number): number {
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(pdfAscii(title), margin, y);
  return y + 5;
}

function drawHorizontal100Bar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  parts: Array<{ pct: number; color: Rgb }>
) {
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  let cursor = x;
  for (const p of parts) {
    if (p.pct <= 0) continue;
    const w = Math.max(0.4, (width * p.pct) / 100);
    doc.setFillColor(...p.color);
    doc.rect(cursor, y, w, height, 'F');
    cursor += w;
  }
  doc.rect(x, y, width, height, 'S');
}

function drawPieSlice(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  color: Rgb
) {
  const sweep = endDeg - startDeg;
  if (sweep <= 0) return;

  doc.setFillColor(...color);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.08);

  const steps = Math.max(16, Math.ceil(sweep / 4));
  for (let i = 0; i < steps; i++) {
    const a1 = startDeg + (sweep * i) / steps;
    const a2 = startDeg + (sweep * (i + 1)) / steps;
    const p1 = polarToXY(cx, cy, r, a1);
    const p2 = polarToXY(cx, cy, r, a2);
    doc.triangle(cx, cy, p1.x, p1.y, p2.x, p2.y, 'F');
  }
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function drawPieChart(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  entries: Array<{ count: number; color: Rgb; label: string }>
) {
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total <= 0) return;

  let angle = 0;
  for (const entry of entries) {
    if (entry.count <= 0) continue;
    const sweep = (entry.count / total) * 360;
    drawPieSlice(doc, cx, cy, radius, angle, angle + sweep, entry.color);

    if (sweep >= 14) {
      const mid = angle + sweep / 2;
      const labelPt = polarToXY(cx, cy, radius * 0.62, mid);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${pct(entry.count, total)}%`, labelPt.x, labelPt.y + 1, { align: 'center' });
    }
    angle += sweep;
  }

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, radius, 'S');
}

function drawPieMixBlock(
  doc: jsPDF,
  x: number,
  y: number,
  boxW: number,
  title: string,
  entries: Array<{ label: string; count: number; color: Rgb }>
): number {
  const total = entries.reduce((s, e) => s + e.count, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(pdfAscii(title), x, y);

  y += 5;
  if (total === 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('No data', x, y + 8);
    return y + 24;
  }

  const radius = Math.min(24, boxW * 0.28);
  const cx = x + radius + 6;
  const cy = y + radius + 2;
  const active = entries.filter((e) => e.count > 0);

  drawPieChart(
    doc,
    cx,
    cy,
    radius,
    active.map((e) => ({ count: e.count, color: e.color, label: e.label }))
  );

  let legY = y + 4;
  const legX = cx + radius + 10;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  for (const e of entries) {
    if (e.count <= 0) continue;
    doc.setFillColor(...e.color);
    doc.rect(legX, legY - 2.5, 2.5, 2.5, 'F');
    doc.setTextColor(71, 85, 105);
    doc.text(pdfAscii(`${e.label}: ${e.count} (${pct(e.count, total)}%)`), legX + 4, legY);
    legY += 4.5;
  }

  return Math.max(cy + radius + 6, legY) + 2;
}

function drawTrendChart(
  doc: jsPDF,
  margin: number,
  y: number,
  width: number,
  height: number,
  trend: OdTrendPoint[]
): number {
  y = ensureSpace(doc, y, height + 16, margin);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('OD trend (by OD date)', margin, y);
  y += 5;

  const chartX = margin;
  const chartY = y;
  const innerH = height - 14;

  if (!trend.length) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('No trend data', chartX, chartY + 12);
    return chartY + height;
  }

  const maxVal = Math.max(1, ...trend.map((t) => t.total));
  const plotX = chartX + 10;
  const plotY = chartY + 8;
  const plotW = width - 20;
  const plotH = innerH - 14;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const gy = plotY + (plotH * i) / 4;
    doc.line(plotX, gy, plotX + plotW, gy);
  }
  doc.setDrawColor(100, 116, 139);
  doc.line(plotX, plotY, plotX, plotY + plotH);
  doc.line(plotX, plotY + plotH, plotX + plotW, plotY + plotH);

  const n = trend.length;
  const pointAt = (idx: number, val: number) => {
    const px = plotX + (n <= 1 ? plotW / 2 : (plotW * idx) / (n - 1));
    const py = plotY + plotH - (val / maxVal) * plotH;
    return { px, py };
  };

  const drawSeriesWithLabels = (
    key: keyof OdTrendPoint,
    color: Rgb,
    labelOffset: { dx: number; dy: number }
  ) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.35);
    let prev: { px: number; py: number } | null = null;
    trend.forEach((t, i) => {
      const val = Number(t[key]) || 0;
      const pt = pointAt(i, val);
      if (prev) doc.line(prev.px, prev.py, pt.px, pt.py);

      doc.setFillColor(...color);
      doc.circle(pt.px, pt.py, 0.9, 'F');

      if (val > 0) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...color);
        doc.text(String(val), pt.px + labelOffset.dx, pt.py + labelOffset.dy, { align: 'center' });
      }
      prev = pt;
    });
  };

  drawSeriesWithLabels('total', [99, 102, 241], { dx: 0, dy: -2.8 });
  drawSeriesWithLabels('pending', STATUS_COLORS.pending, { dx: -2.5, dy: 3.2 });
  drawSeriesWithLabels('approved', STATUS_COLORS.approved, { dx: 2.5, dy: 3.2 });

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  const labelStep = n <= 8 ? 1 : Math.ceil(n / 8);
  trend.forEach((t, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return;
    const { px } = pointAt(i, 0);
    doc.text(pdfAscii(t.label), px - 4, plotY + plotH + 4);
  });

  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Total', plotX + plotW - 38, chartY + 2);
  doc.setDrawColor(99, 102, 241);
  doc.line(plotX + plotW - 42, chartY + 1.5, plotX + plotW - 36, chartY + 1.5);
  doc.text('Pending', plotX + plotW - 38, chartY + 6);
  doc.setDrawColor(...STATUS_COLORS.pending);
  doc.line(plotX + plotW - 42, chartY + 5.5, plotX + plotW - 36, chartY + 5.5);
  doc.text('Approved', plotX + plotW - 38, chartY + 10);
  doc.setDrawColor(...STATUS_COLORS.approved);
  doc.line(plotX + plotW - 42, chartY + 9.5, plotX + plotW - 36, chartY + 9.5);

  return chartY + height;
}

function drawDivisionStatusBars(
  doc: jsPDF,
  margin: number,
  y: number,
  pageWidth: number,
  divisions: OdOrgAggregateRow[]
): number {
  y = ensureSpace(doc, y, 20, margin);
  y = drawSectionTitle(doc, 'Status share by division (100% stacked)', y, margin);

  const barX = margin + 52;
  const barW = pageWidth - margin - barX - 8;
  const rowH = 7;

  for (const row of divisions.filter((r) => r.total > 0).slice(0, 12)) {
    y = ensureSpace(doc, y, rowH + 2, margin);
    const t = row.total;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const label = row.name.length > 24 ? `${row.name.slice(0, 22)}..` : row.name;
    doc.text(pdfAscii(label), margin, y + 4);

    drawHorizontal100Bar(doc, barX, y, barW, 5, [
      { pct: pct(row.pending, t), color: STATUS_COLORS.pending },
      { pct: pct(row.approved, t), color: STATUS_COLORS.approved },
      { pct: pct(row.rejected, t), color: STATUS_COLORS.rejected },
      { pct: pct(row.cancelled, t), color: STATUS_COLORS.cancelled },
    ]);
    y += rowH;
  }

  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('Legend: Pending | Approved | Rejected | Cancelled', margin, y + 2);
  return y + 8;
}

function drawDivisionTypeBars(
  doc: jsPDF,
  margin: number,
  y: number,
  pageWidth: number,
  divisions: OdOrgAggregateRow[]
): number {
  y = ensureSpace(doc, y, 50, margin);
  y = drawSectionTitle(doc, 'Division comparison (CO / Hours / Regular)', y, margin);

  const rows = divisions.filter((r) => r.total > 0).slice(0, 10);
  if (!rows.length) return y;

  const chartX = margin + 4;
  const chartY = y + 2;
  const chartW = pageWidth - margin * 2 - 8;
  const chartH = 42;
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const groupW = chartW / rows.length;
  const barMaxH = chartH - 10;

  doc.setDrawColor(100, 116, 139);
  doc.line(chartX, chartY + barMaxH, chartX + chartW, chartY + barMaxH);

  rows.forEach((row, i) => {
    const gx = chartX + i * groupW + groupW * 0.2;
    const bw = groupW * 0.55;
    let stackY = chartY + barMaxH;
    const segments = [
      { val: row.co, color: SEGMENT_COLORS.co },
      { val: row.hours, color: SEGMENT_COLORS.hours },
      { val: row.regular, color: SEGMENT_COLORS.regular },
    ];
    for (const seg of segments) {
      if (seg.val <= 0) continue;
      const h = (seg.val / maxTotal) * barMaxH;
      stackY -= h;
      doc.setFillColor(...seg.color);
      doc.rect(gx, stackY, bw, h, 'F');
    }
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139);
    const lbl = row.name.length > 10 ? `${row.name.slice(0, 8)}..` : row.name;
    doc.text(pdfAscii(lbl), gx + bw / 2, chartY + barMaxH + 4, { align: 'center' });
  });

  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const legY = chartY + chartH + 6;
  doc.setFillColor(...SEGMENT_COLORS.co);
  doc.rect(margin, legY - 2.5, 3, 3, 'F');
  doc.text('CO', margin + 5, legY);
  doc.setFillColor(...SEGMENT_COLORS.hours);
  doc.rect(margin + 18, legY - 2.5, 3, 3, 'F');
  doc.text('Hours', margin + 23, legY);
  doc.setFillColor(...SEGMENT_COLORS.regular);
  doc.rect(margin + 42, legY - 2.5, 3, 3, 'F');
  doc.text('Regular', margin + 47, legY);

  return legY + 8;
}

export function drawOdAuditChartsSection(
  doc: jsPDF,
  args: {
    statusBreakdown: OdStatusBreakdown;
    coCount: number;
    hoursCount: number;
    regularCount: number;
    divisionAggregates?: OdOrgAggregateRow[];
    trend?: OdTrendPoint[];
  },
  startY: number
): number {
  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = ensureSpace(doc, startY, 52, margin);

  y = drawSectionTitle(doc, 'Charts & distributions', y, margin);

  const sb = args.statusBreakdown;
  const boxW = (pageWidth - margin * 2 - 8) / 2;
  const leftX = margin;
  const rightX = margin + boxW + 8;
  const mixTop = y;

  const statusEntries = [
    { label: 'Pending', count: sb.pending, color: STATUS_COLORS.pending },
    { label: 'Approved', count: sb.approved, color: STATUS_COLORS.approved },
    { label: 'Rejected', count: sb.rejected, color: STATUS_COLORS.rejected },
    { label: 'Cancelled', count: sb.cancelled, color: STATUS_COLORS.cancelled },
    ...(sb.other ? [{ label: 'Other', count: sb.other, color: STATUS_COLORS.other }] : []),
  ];

  const segmentEntries = [
    { label: 'CO Eligible', count: args.coCount, color: SEGMENT_COLORS.co },
    { label: 'Hour-Based', count: args.hoursCount, color: SEGMENT_COLORS.hours },
    { label: 'Regular', count: args.regularCount, color: SEGMENT_COLORS.regular },
  ];

  const leftEnd = drawPieMixBlock(doc, leftX, mixTop, boxW, 'Status mix (100%)', statusEntries);
  const rightEnd = drawPieMixBlock(doc, rightX, mixTop, boxW, 'Type mix (100%)', segmentEntries);
  y = Math.max(leftEnd, rightEnd) + 6;

  if (args.trend?.length) {
    y = drawTrendChart(doc, margin, y, pageWidth - margin * 2, 58, args.trend) + 6;
  }

  if (args.divisionAggregates?.length) {
    y = drawDivisionStatusBars(doc, margin, y, pageWidth, args.divisionAggregates);
    y = drawDivisionTypeBars(doc, margin, y, pageWidth, args.divisionAggregates);
  }

  return y + 4;
}
