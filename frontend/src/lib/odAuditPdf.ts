import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type OdAuditStatsRecord,
  type OdOrgAggregateRow,
  type OdStatusBreakdown,
  type OdTrendPoint,
  type OdUserPendingRow,
  odSegmentOf,
  OD_STATUS_LABELS,
} from './odAuditStats';
import { drawOdAuditChartsSection } from './odAuditPdfCharts';

export type ODAuditPdfRecord = OdAuditStatsRecord;

export type ODAuditPdfMeta = {
  period: { from: string; to: string };
  total: number;
  coCount: number;
  hoursCount: number;
  regularCount: number;
  statusBreakdown: OdStatusBreakdown;
  pendingByUser: OdUserPendingRow[];
  divisionAggregates?: OdOrgAggregateRow[];
  trend?: OdTrendPoint[];
  statusLabel?: string;
};

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

const SEGMENTS: { id: 'co' | 'hours' | 'regular'; label: string; headColor: [number, number, number] }[] = [
  { id: 'co', label: 'CO Eligible ODs', headColor: [237, 233, 254] },
  { id: 'hours', label: 'Hour-Based ODs', headColor: [224, 242, 254] },
  { id: 'regular', label: 'Regular ODs', headColor: [248, 250, 252] },
];

function pdfAscii(text: string): string {
  return String(text ?? '')
    .replace(/\u2192/g, '->')
    .replace(/[^\x00-\x7F]/g, '');
}

function formatDate(d?: string | null): string {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

function fmtHours(h?: number | null): string {
  if (h == null) return '-';
  const totalMins = Math.round(h * 60);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return `${hrs}:${String(mins).padStart(2, '0')}`;
}

function durationLabel(od: ODAuditPdfRecord): string {
  if (od.odType_extended === 'hours' && od.durationHours != null) return fmtHours(od.durationHours);
  if (od.isHalfDay) return `Half (${od.halfDayType === 'first_half' ? '1st' : '2nd'})`;
  return `${od.numberOfDays ?? '-'} day${(od.numberOfDays ?? 1) !== 1 ? 's' : ''}`;
}

function datesLabel(od: ODAuditPdfRecord): string {
  const from = formatDate(od.fromDate);
  if (od.toDate && od.fromDate !== od.toDate) return `${from} -> ${formatDate(od.toDate)}`;
  if (od.odType_extended === 'hours' && od.odStartTime) {
    return `${from} (${od.odStartTime}-${od.odEndTime || ''})`;
  }
  return from;
}

function approvalChainLabel(od: ODAuditPdfRecord): string {
  const chain = od.workflow?.approvalChain || [];
  if (!chain.length) return '-';
  return chain
    .map((step) => {
      const role = step.label || step.role || '?';
      const st = step.status || 'pending';
      const by = step.actionByName ? ` ${step.actionByName}` : '';
      return `${role}(${st})${by}`;
    })
    .join('; ');
}

function typeTags(od: ODAuditPdfRecord): string {
  const tags: string[] = [];
  if (od.isCOEligible) tags.push('CO');
  if (od.odType_extended === 'hours') tags.push('Hours');
  if (od.isHalfDay) tags.push('Half');
  if (od.isAssigned) tags.push('Assigned');
  return tags.length ? tags.join(', ') : '';
}

function drawHeader(doc: jsPDF, meta: ODAuditPdfMeta) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('OD AUDIT REPORT', 12, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Summary, charts, pending by employee, and detailed OD records', 12, 18);
  doc.text(
    pdfAscii(
      `Period: ${meta.period.from} -> ${meta.period.to}  |  Total: ${meta.total}  |  CO: ${meta.coCount}  |  Hours: ${meta.hoursCount}  |  Regular: ${meta.regularCount}`
    ),
    12,
    24
  );
  if (meta.statusLabel) {
    doc.text(pdfAscii(`Status filter: ${meta.statusLabel}`), 12, 29);
  }
}

function drawSummaryAggregatesSection(doc: DocWithAutoTable, meta: ODAuditPdfMeta, startY: number): number {
  const margin = 10;
  let y = startY;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Summary aggregates', margin, y);
  y += 5;

  const sb = meta.statusBreakdown;
  autoTable(doc, {
    startY: y,
    head: [['Status', 'Count']],
    body: [
      ['Pending (in workflow)', String(sb.pending)],
      ['Approved', String(sb.approved)],
      ['Rejected', String(sb.rejected)],
      ['Cancelled', String(sb.cancelled)],
      ...(sb.other ? [['Other', String(sb.other)]] : []),
      ['Total', String(meta.total)],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    tableWidth: 80,
  });

  y = (doc.lastAutoTable?.finalY ?? y) + 6;

  autoTable(doc, {
    startY: y,
    head: [['Segment', 'Count']],
    body: [
      ['CO Eligible', String(meta.coCount)],
      ['Hour-Based', String(meta.hoursCount)],
      ['Regular', String(meta.regularCount)],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    tableWidth: 80,
  });

  return (doc.lastAutoTable?.finalY ?? y) + 8;
}

function drawDivisionAggregatesSection(doc: DocWithAutoTable, meta: ODAuditPdfMeta, startY: number): number {
  const margin = 10;
  if (!meta.divisionAggregates?.length) return startY;

  let y = startY;
  const orgHead = [['Name', 'Total', 'Pend', 'Appr', 'Rej', 'Canc', 'CO', 'Hrs', 'Reg']];
  const orgRow = (r: OdOrgAggregateRow) => [
    pdfAscii(r.name),
    String(r.total),
    String(r.pending),
    String(r.approved),
    String(r.rejected),
    String(r.cancelled),
    String(r.co),
    String(r.hours),
    String(r.regular),
  ];

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Division aggregates', margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: orgHead,
    body: meta.divisionAggregates.map(orgRow),
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [224, 231, 255], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  return (doc.lastAutoTable?.finalY ?? y) + 10;
}

function drawPendingByEmployeeSection(doc: DocWithAutoTable, meta: ODAuditPdfMeta, startY: number): number {
  const margin = 10;
  let y = startY;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Pending by employee', margin, y);
  y += 5;

  if (!meta.pendingByUser.length) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('No pending ODs by employee for the selected filters.', margin, y);
    return y + 8;
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${meta.pendingByUser.length} employee(s) with pending ODs`, margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Employee', 'Emp #', 'Department', 'CO', 'Hours', 'Regular', 'Total']],
    body: meta.pendingByUser.map((row) => [
      pdfAscii(row.empName),
      pdfAscii(row.empNo),
      pdfAscii(row.department),
      String(row.co),
      String(row.hours),
      String(row.regular),
      String(row.total),
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [254, 243, 199], textColor: [120, 53, 15], fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  return (doc.lastAutoTable?.finalY ?? y) + 10;
}

function beginNewSectionPage(doc: jsPDF, margin: number): number {
  doc.addPage();
  return margin + 4;
}

function drawDetailedRecordsHeader(doc: jsPDF, y: number, margin: number): number {
  y = ensurePageForBlock(doc, y, 12, margin);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Detailed records', margin, y);
  return y + 6;
}

function ensurePageForBlock(doc: jsPDF, y: number, needed: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - margin) {
    doc.addPage();
    return margin + 4;
  }
  return y;
}

function rowForOd(od: ODAuditPdfRecord): string[] {
  const emp = od.employeeId;
  const empName = emp?.employee_name || od.emp_no;
  const empNo = emp?.emp_no || od.emp_no;
  const dept = emp?.department_id?.name || '';
  const desig = emp?.designation_id?.name || '';
  const deptLine = [dept, desig].filter(Boolean).join(' / ');

  return [
    pdfAscii(`${empName}\n${empNo}${deptLine ? `\n${deptLine}` : ''}`),
    pdfAscii(`${od.odType || '-'}${typeTags(od) ? `\n[${typeTags(od)}]` : ''}`),
    pdfAscii(`${datesLabel(od)}\n${durationLabel(od)}`),
    pdfAscii(od.placeVisited || '-'),
    pdfAscii(od.purpose || '-'),
    pdfAscii(OD_STATUS_LABELS[od.status || ''] || od.status || '-'),
    pdfAscii(approvalChainLabel(od)),
    pdfAscii(formatDate(od.createdAt)),
  ];
}

export function exportOdAuditPdf(meta: ODAuditPdfMeta, records: ODAuditPdfRecord[]): void {
  const doc = new jsPDF('l', 'mm', 'a4') as DocWithAutoTable;
  const margin = 10;
  drawHeader(doc, meta);

  const buckets: Record<'co' | 'hours' | 'regular', ODAuditPdfRecord[]> = {
    co: [],
    hours: [],
    regular: [],
  };
  for (const od of records) buckets[odSegmentOf(od)].push(od);

  let y = drawSummaryAggregatesSection(doc, meta, 38);
  drawDivisionAggregatesSection(doc, meta, y);

  y = beginNewSectionPage(doc, margin);
  drawOdAuditChartsSection(
    doc,
    {
      statusBreakdown: meta.statusBreakdown,
      coCount: meta.coCount,
      hoursCount: meta.hoursCount,
      regularCount: meta.regularCount,
      divisionAggregates: meta.divisionAggregates,
      trend: meta.trend,
    },
    y
  );

  y = beginNewSectionPage(doc, margin);
  drawPendingByEmployeeSection(doc, meta, y);

  y = beginNewSectionPage(doc, margin);
  y = drawDetailedRecordsHeader(doc, y, margin);
  const head = [['Employee', 'OD Type', 'Dates / Duration', 'Place', 'Purpose', 'Status', 'Approval Chain', 'Applied']];

  for (const seg of SEGMENTS) {
    const rows = buckets[seg.id];
    if (!rows.length) continue;

    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 14;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(pdfAscii(`${seg.label} (${rows.length})`), margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head,
      body: rows.map(rowForOd),
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: seg.headColor, textColor: [51, 65, 85], fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 32 },
        4: { cellWidth: 38 },
        5: { cellWidth: 22 },
        6: { cellWidth: 55 },
        7: { cellWidth: 22 },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 8;
  }

  if (!records.length) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No OD records found for the selected filters.', margin, y);
  }

  const filename = `OD_Audit_${meta.period.from}_${meta.period.to}.pdf`;
  doc.save(filename);
}
