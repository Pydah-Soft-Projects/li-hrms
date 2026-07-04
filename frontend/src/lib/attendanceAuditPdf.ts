import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompareData } from '@/components/attendance/AttendanceAuditCompareGrid';

type SummaryCol = { key: string; label: string; short: string };

const SINGLE_SHIFT_SUMMARY_COLUMNS: SummaryCol[] = [
  { key: 'present', label: 'Present', short: 'Pres' },
  { key: 'weekOffs', label: 'Week offs', short: 'WO' },
  { key: 'holidays', label: 'Holidays', short: 'Hol' },
  { key: 'paidLeaves', label: 'Paid leave', short: 'Paid' },
  { key: 'lop', label: 'LOP', short: 'LOP' },
  { key: 'od', label: 'OD', short: 'OD' },
  { key: 'absent', label: 'Absent', short: 'Abs' },
  { key: 'totalDaysSummed', label: 'Total', short: 'Tot' },
  { key: 'periodDays', label: 'Period days', short: 'Per' },
  { key: 'lates', label: 'Late/early', short: 'Lt' },
  { key: 'dedAbsent', label: 'Ded. absent', short: 'DAbs' },
  { key: 'attDed', label: 'Att. ded.', short: 'Ded' },
  { key: 'paidDays', label: 'Paid days', short: 'PDays' },
];

const MULTI_SHIFT_SUMMARY_COLUMNS: SummaryCol[] = [
  { key: 'present', label: 'Present', short: 'Pres' },
  { key: 'weekOffs', label: 'Week offs', short: 'WO' },
  { key: 'holidays', label: 'Holidays', short: 'Hol' },
  { key: 'leaves', label: 'Leaves', short: 'Lv' },
  { key: 'paidLeaves', label: 'Paid leave', short: 'Paid' },
  { key: 'lop', label: 'LOP', short: 'LOP' },
  { key: 'od', label: 'OD', short: 'OD' },
  { key: 'absent', label: 'Absent', short: 'Abs' },
  { key: 'partial', label: 'Partial', short: 'Part' },
  { key: 'totalDaysSummed', label: 'Total', short: 'Tot' },
  { key: 'periodDays', label: 'Period days', short: 'Per' },
  { key: 'lates', label: 'Late/early', short: 'Lt' },
  { key: 'attDed', label: 'Att. ded.', short: 'Ded' },
  { key: 'payableShifts', label: 'Payable', short: 'Pay' },
];

const FIELD_LABELS: Record<string, string> = {
  present: 'Present',
  weekOffs: 'Week offs',
  holidays: 'Holidays',
  leaves: 'Leaves',
  paidLeaves: 'Paid leave',
  lop: 'LOP',
  od: 'OD',
  absent: 'Absent',
  partial: 'Partial',
  totalDaysSummed: 'Total',
  periodDays: 'Period days',
  lates: 'Late/early',
  dedAbsent: 'Ded. absent',
  attDed: 'Att. ded.',
  paidDays: 'Paid days',
  payableShifts: 'Payable',
};

function summaryColumnsForMode(mode?: string) {
  return mode === 'single_shift' ? SINGLE_SHIFT_SUMMARY_COLUMNS : MULTI_SHIFT_SUMMARY_COLUMNS;
}

function formatDayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function pdfAscii(text: string): string {
  return String(text ?? '')
    .replace(/\u2192/g, '->')
    .replace(/\u0394/g, 'd')
    .replace(/[^\x00-\x7F]/g, '');
}

function formatSummaryValue(value?: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatNum(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Same as UI "Mismatches & edits only" — avoids listing every calendar day. */
function visibleDaysForPdf(item: CompareData) {
  const issueDays = item.dayComparisons.filter((d) => d.mismatch || d.hasEdits || d.isConflict);
  return issueDays.length > 0 ? issueDays : item.dayComparisons;
}

type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function drawReportHeader(doc: jsPDF, overview: AttendanceAuditPdfMeta) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('ATTENDANCE AUDIT', 12, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Attendance monthly view vs pay register (same layout as screen)', 12, 18);
  doc.text(
    pdfAscii(
      `Month: ${overview.month}  |  ${overview.period.start} -> ${overview.period.end}  |  ${overview.total} in scope, ${overview.flagged} with issues`
    ),
    12,
    24
  );
}

function drawEmployeeCompareGrid(doc: DocWithAutoTable, item: CompareData, startY: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const minBlockHeight = 42;

  if (startY + minBlockHeight > pageHeight - margin) {
    doc.addPage('a4', 'l');
    startY = margin;
  }

  const summaryColumns = summaryColumnsForMode(item.processingMode);
  const diffFields = new Set((item.summaryDiffs || []).map((d) => d.field));
  const visibleDays = visibleDaysForPdf(item);
  const issueDayCount = item.dayComparisons.filter((d) => d.mismatch || d.hasEdits || d.isConflict).length;
  const showingIssueDaysOnly = issueDayCount > 0 && visibleDays.length === issueDayCount;

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    pdfAscii(`${item.employee.emp_no} - ${item.employee.employee_name}`),
    margin,
    startY
  );

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const metaParts = [
    item.employee.department || '',
    item.processingMode || '',
    showingIssueDaysOnly ? `issue days only (${visibleDays.length})` : `all days (${visibleDays.length})`,
  ].filter(Boolean);
  doc.text(pdfAscii(metaParts.join('  |  ')), margin, startY + 4);

  const badgeY = startY + 8;
  const badges: string[] = [];
  if (item.mismatchDayCount > 0) badges.push(`${item.mismatchDayCount} day mismatch`);
  if (item.editDayCount > 0) badges.push(`${item.editDayCount} day with edits`);
  if (item.summaryDiffs.length > 0) badges.push(`${item.summaryDiffs.length} summary diff`);
  if (!item.hasPayRegister) badges.push('no pay register row');
  if (badges.length) {
    doc.setTextColor(185, 28, 28);
    doc.text(pdfAscii(badges.join('  ·  ')), margin, badgeY);
  }

  const dayHeaders = visibleDays.map((d) => formatDayLabel(d.date));
  const summaryHeaders = summaryColumns.map((c) => c.short);
  const head = [['Source', ...dayHeaders, ...summaryHeaders]];

  const attDayCells = visibleDays.map((d) => pdfAscii(d.attendanceCell || '-'));
  const prDayCells = visibleDays.map((d) => pdfAscii(d.payRegisterCell || '-'));
  const attSummaryCells = summaryColumns.map((c) =>
    formatSummaryValue(item.rows.attendance.summary[c.key])
  );
  const prSummaryCells = summaryColumns.map((c) =>
    formatSummaryValue(item.rows.payRegister.summary[c.key])
  );

  const attLabel = pdfAscii(item.rows.attendance.label);
  const prLabel = pdfAscii(
    item.hasPayRegister ? item.rows.payRegister.label : `${item.rows.payRegister.label} (missing)`
  );

  const dayColCount = visibleDays.length;
  const summaryStartCol = 1 + dayColCount;

  autoTable(doc, {
    startY: startY + 11,
    head,
    body: [
      [attLabel, ...attDayCells, ...attSummaryCells],
      [prLabel, ...prDayCells, ...prSummaryCells],
    ],
    theme: 'grid',
    styles: {
      fontSize: 6,
      cellPadding: 1.2,
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 6,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 28, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    didParseCell: (hook) => {
      const { section, row, column, cell } = hook;
      if (section === 'head' && column.index >= summaryStartCol) {
        const colKey = summaryColumns[column.index - summaryStartCol]?.key;
        if (colKey && diffFields.has(colKey)) {
          cell.styles.fillColor = [255, 237, 213];
        } else {
          cell.styles.fillColor = [238, 242, 255];
        }
      }
      if (section === 'head' && column.index >= 1 && column.index < summaryStartCol) {
        const day = visibleDays[column.index - 1];
        if (day?.mismatch) cell.styles.fillColor = [254, 226, 226];
        else if (day?.hasEdits) cell.styles.fillColor = [254, 243, 199];
      }
      if (section === 'body') {
        if (column.index === 0) {
          cell.styles.fillColor = row.index === 0 ? [236, 253, 245] : [240, 249, 255];
          cell.styles.halign = 'left';
        }
        if (column.index >= 1 && column.index < summaryStartCol) {
          const day = visibleDays[column.index - 1];
          if (day?.mismatch) cell.styles.fillColor = [254, 226, 226];
          else if (day?.hasEdits) cell.styles.fillColor = [254, 243, 199];
        }
        if (column.index >= summaryStartCol) {
          const colKey = summaryColumns[column.index - summaryStartCol]?.key;
          if (colKey && diffFields.has(colKey)) {
            cell.styles.fillColor = [255, 237, 213];
            cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  let y = doc.lastAutoTable?.finalY ?? startY + 30;

  if (item.summaryDiffs.length > 0) {
    const diffText = item.summaryDiffs
      .map((d) => {
        const label = FIELD_LABELS[d.field] || d.field;
        const delta = d.delta >= 0 ? `+${formatNum(d.delta)}` : formatNum(d.delta);
        return `${label}: Att ${formatNum(d.attendance)} -> PR ${formatNum(d.payRegister)} (${delta})`;
      })
      .join('   |   ');

    autoTable(doc, {
      startY: y + 2,
      head: [['Summary differences']],
      body: [[pdfAscii(diffText)]],
      theme: 'plain',
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: { fillColor: [255, 237, 213], textColor: [154, 52, 18], fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable?.finalY ?? y + 8;
  }

  return y + 8;
}

export type AttendanceAuditPdfMeta = {
  month: string;
  period: { start: string; end: string };
  total: number;
  flagged: number;
  shown: number;
  onlyIssues?: boolean;
  truncated?: boolean;
};

export function exportAttendanceAuditPdf(
  overview: AttendanceAuditPdfMeta,
  employees: CompareData[]
): void {
  const doc = new jsPDF('l', 'mm', 'a4') as DocWithAutoTable;

  drawReportHeader(doc, overview);

  let y = 36;

  if (!employees.length) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No employees in scope for this export.', 12, y);
  } else {
    if (overview.truncated) {
      doc.setFontSize(7);
      doc.setTextColor(180, 83, 9);
      doc.text(
        pdfAscii('Note: on-screen list was truncated — PDF includes only loaded employees (max 150).'),
        12,
        y
      );
      y += 6;
    }

    for (const item of employees) {
      y = drawEmployeeCompareGrid(doc, item, y);
    }
  }

  const safeMonth = overview.month.replace(/[^\d-]/g, '');
  doc.save(`Attendance_Audit_${safeMonth}_${Date.now()}.pdf`);
}
