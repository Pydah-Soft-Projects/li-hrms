import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompareData } from '@/components/attendance/AttendanceAuditCompareGrid';

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
  otHours: 'OT hrs',
  extraHours: 'Extra hrs',
  permissions: 'Permissions',
  permissionDeductionDays: 'Perm. ded.',
};

function pdfAscii(text: string): string {
  return String(text ?? '')
    .replace(/\u2192/g, '->')
    .replace(/\u0394/g, 'd')
    .replace(/[^\x00-\x7F]/g, '');
}

function formatNum(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatAbstractDifference(item: CompareData): string {
  const parts: string[] = [];

  if (!item.hasPayRegister) {
    parts.push('No pay register row');
  }
  if (item.mismatchDayCount > 0) {
    parts.push(`${item.mismatchDayCount} day mismatch(es)`);
  }
  if (item.editDayCount > 0) {
    parts.push(`${item.editDayCount} day(s) with edits`);
  }

  for (const d of item.summaryDiffs || []) {
    const label = FIELD_LABELS[d.field] || d.field;
    const delta = d.delta >= 0 ? `+${formatNum(d.delta)}` : formatNum(d.delta);
    parts.push(`${label}: Att ${formatNum(d.attendance)} vs PR ${formatNum(d.payRegister)} (${delta})`);
  }

  return parts.length ? parts.join('; ') : 'Aligned';
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
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ATTENDANCE AUDIT', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Abstract differences — attendance monthly view vs pay register', 14, 21);
  doc.text(
    pdfAscii(
      `Month: ${overview.month}  |  Period: ${overview.period.start} -> ${overview.period.end}  |  Generated: ${new Date().toLocaleString('en-IN')}`
    ),
    14,
    27
  );

  const summaryLine = pdfAscii(
    `${overview.total} in scope, ${overview.flagged} with issues, showing ${overview.shown}${overview.onlyIssues ? ' (issues only)' : ''}${overview.truncated ? ' — list truncated' : ''}`
  );

  autoTable(doc, {
    startY: 38,
    head: [['Summary']],
    body: [[summaryLine]],
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const startY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48;

  const body = employees.map((item) => [
    pdfAscii(String(item.employee.emp_no || '')),
    pdfAscii(String(item.employee.employee_name || '')),
    pdfAscii(String(item.employee.department || '')),
    String(item.mismatchDayCount || 0),
    String(item.editDayCount || 0),
    pdfAscii(formatAbstractDifference(item)),
  ]);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Emp No', 'Name', 'Department', 'Day MM', 'Edits', 'Abstract difference']],
    body: body.length ? body : [['—', 'No employees in scope', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 38 },
      2: { cellWidth: 32 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  const safeMonth = overview.month.replace(/[^\d-]/g, '');
  doc.save(`Attendance_Audit_${safeMonth}_${Date.now()}.pdf`);
}
