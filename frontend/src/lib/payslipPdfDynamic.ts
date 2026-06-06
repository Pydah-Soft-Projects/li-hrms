import type { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyProfile } from '@/lib/companyProfile';
import type { PayslipLoans, PayslipSections } from '@/lib/api';
import {
  formatInrPdf,
  formatSectionValuePdf,
  sectionsToPdfTableBody,
  type PayslipSectionItem,
} from '@/lib/payslipSections';
import { drawPayslipCompanyHeader, drawPayslipFooter } from '@/lib/payslipPdf';
import { payslipHasLoans } from '@/lib/payslipLoans';
import { resolvePayslipAccentDarkRgb } from '@/lib/payslipTheme';

type EmployeeLike = {
  employee_name?: string;
  emp_no?: string;
  department_id?: { name?: string } | string;
  designation_id?: { name?: string } | string;
  bank_account_no?: string;
  pf_number?: string;
  location?: string;
};

type PayrollLike = {
  _id: string;
  month: string;
  monthName?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
};

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const SLATE_50: [number, number, number] = [248, 250, 252];
const DED: [number, number, number] = [190, 24, 60];
const DED_SOFT: [number, number, number] = [255, 241, 243];
const AMBER_DARK: [number, number, number] = [180, 83, 9];

const ATTENDANCE_FIELDS_PER_ROW = 5;

function chunkAttendanceRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

function drawPdfAttendanceSummary(
  doc: jsPDF,
  items: PayslipSectionItem[],
  opts: { x: number; y: number; width: number }
): number {
  if (items.length === 0) return opts.y;

  let y = opts.y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text('Attendance', opts.x, y);
  y += 7;

  const rows = chunkAttendanceRows(items, ATTENDANCE_FIELDS_PER_ROW);
  doc.setFontSize(9);

  rows.forEach((rowItems) => {
    const colW = opts.width / rowItems.length;
    rowItems.forEach((item, i) => {
      const cx = opts.x + i * colW;
      const label = `${item.header}: `;
      const value = formatSectionValuePdf(item.value, 'attendance');

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      doc.text(label, cx, y);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(value, cx + doc.getTextWidth(label), y);
    });
    y += 6;
  });

  doc.setFont('helvetica', 'normal');
  return y + 4;
}

export async function drawDynamicPayslipPdf(
  doc: jsPDF,
  opts: {
    payroll: PayrollLike;
    employee: EmployeeLike;
    sections: PayslipSections;
    loans?: PayslipLoans;
    profile: CompanyProfile;
  }
): Promise<void> {
  const { payroll, employee, sections, loans, profile } = opts;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ACCENT_DARK = resolvePayslipAccentDarkRgb(profile);

  let periodLabel = `${payroll.monthName || ''} ${payroll.year || ''}`.trim();
  if (payroll.startDate && payroll.endDate) {
    const startStr = new Date(payroll.startDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
    const endStr = new Date(payroll.endDate).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    periodLabel += ` | ${startStr} - ${endStr}`;
  }

  let y = await drawPayslipCompanyHeader(doc, profile, {
    periodLabel,
    refId: payroll._id.toString().slice(-8).toUpperCase(),
    confidentialLabel: 'CONFIDENTIAL',
  });

  const totalEarnings = sections.totalEarnings ?? 0;
  const totalDeductions = sections.totalDeductions ?? 0;
  const netPayable = sections.netPayable ?? totalEarnings - totalDeductions;

  const getName = (x: { name?: string } | string | undefined) =>
    typeof x === 'object' && x?.name ? x.name : String(x || '—');

  const cardY = y;
  const cardW = 58;
  const cardH = 22;
  const cardGap = 4;
  const cardX = [14, 14 + cardW + cardGap, 14 + (cardW + cardGap) * 2];

  doc.setFillColor(SLATE_50[0], SLATE_50[1], SLATE_50[2]);
  doc.rect(cardX[0], cardY, cardW, cardH, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('TOTAL EARNINGS', cardX[0] + 4, cardY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2]);
  doc.text(formatInrPdf(totalEarnings), cardX[0] + 4, cardY + 17);

  doc.setFillColor(DED_SOFT[0], DED_SOFT[1], DED_SOFT[2]);
  doc.rect(cardX[1], cardY, cardW, cardH, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('TOTAL DEDUCTIONS', cardX[1] + 4, cardY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(DED[0], DED[1], DED[2]);
  doc.text(formatInrPdf(totalDeductions), cardX[1] + 4, cardY + 17);

  doc.setFillColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2]);
  doc.rect(cardX[2], cardY, cardW, cardH, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(220, 252, 231);
  doc.text('NET PAYABLE', cardX[2] + 4, cardY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(formatInrPdf(netPayable), cardX[2] + 4, cardY + 17);
  doc.setFont('helvetica', 'normal');

  y = cardY + cardH + 8;

  const empPanelH = 28;
  doc.setFillColor(SLATE_50[0], SLATE_50[1], SLATE_50[2]);
  doc.rect(12, y, pageWidth - 24, empPanelH, 'F');
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.rect(12, y, pageWidth - 24, empPanelH, 'S');

  const col1 = 16;
  const col2 = pageWidth / 2 + 4;
  const row1 = y + 8;
  const row2 = y + 15;
  const row3 = y + 22;

  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Employee', col1, row1);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(employee.employee_name || '—', col1 + 28, row1);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Employee ID', col2, row1);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(employee.emp_no || '—', col2 + 28, row1);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Department', col1, row2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(getName(employee.department_id), col1 + 28, row2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Designation', col2, row2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(getName(employee.designation_id), col2 + 28, row2);

  if (employee.bank_account_no) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('Bank A/C', col1, row3);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(employee.bank_account_no, col1 + 28, row3);
  }
  doc.setFont('helvetica', 'normal');

  y += empPanelH + 8;

  if (sections.attendance.length > 0) {
    y = drawPdfAttendanceSummary(doc, sections.attendance, {
      x: 14,
      y,
      width: pageWidth - 28,
    });
  }

  const earningsBody = sectionsToPdfTableBody(sections.earnings, 'earnings');
  const deductionsBody = sectionsToPdfTableBody(sections.deductions, 'deductions');

  if (earningsBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['EARNINGS', 'AMOUNT']],
      body: earningsBody,
      foot: [['Total earnings', formatInrPdf(totalEarnings)]],
      theme: 'plain',
      headStyles: {
        fontStyle: 'bold',
        textColor: WHITE,
        fontSize: 8,
        cellPadding: 3,
        fillColor: ACCENT_DARK,
      },
      bodyStyles: { fontSize: 8, textColor: INK, cellPadding: 2.5, fillColor: WHITE },
      footStyles: {
        fontStyle: 'bold',
        textColor: ACCENT_DARK,
        fontSize: 9,
        cellPadding: 3,
        fillColor: WHITE,
      },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 12, right: pageWidth / 2 + 2 },
    });
  }

  if (deductionsBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['DEDUCTIONS', 'AMOUNT']],
      body: deductionsBody,
      foot: [['Total deductions', formatInrPdf(totalDeductions)]],
      theme: 'plain',
      headStyles: {
        fontStyle: 'bold',
        textColor: WHITE,
        fontSize: 8,
        cellPadding: 3,
        fillColor: DED,
      },
      bodyStyles: { fontSize: 8, textColor: INK, cellPadding: 2.5, fillColor: WHITE },
      footStyles: {
        fontStyle: 'bold',
        textColor: DED,
        fontSize: 9,
        cellPadding: 3,
        fillColor: WHITE,
      },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: pageWidth / 2 + 2, right: 12 },
    });
  }

  y = Math.max((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y, y + 48) + 10;

  if (loans && payslipHasLoans(loans) && loans.items.length > 0) {
    const loanSection = loans;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('Loans', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('EMI is part of deductions. Balances are per loan for this month.', 14, y);
    y += 6;

    const loanBody = loanSection.items.map((item) => [
      item.label,
      formatInrPdf(item.balanceBefore),
      formatInrPdf(item.emiDeducted),
      formatInrPdf(item.balanceAfter),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['LOAN', 'BALANCE BEFORE', 'EMI DEDUCTED', 'BALANCE AFTER']],
      body: loanBody,
      foot: [
        [
          'Total',
          '',
          formatInrPdf(loanSection.totalEmiDeducted),
          formatInrPdf(loanSection.totalBalanceAfter),
        ],
      ],
      theme: 'plain',
      headStyles: {
        fontStyle: 'bold',
        textColor: WHITE,
        fontSize: 7.5,
        cellPadding: 3,
        fillColor: AMBER_DARK,
      },
      bodyStyles: { fontSize: 8, textColor: INK, cellPadding: 2.5, fillColor: WHITE },
      footStyles: {
        fontStyle: 'bold',
        textColor: AMBER_DARK,
        fontSize: 8,
        cellPadding: 3,
        fillColor: WHITE,
      },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', textColor: DED, fontStyle: 'bold' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 12, right: 12 },
    });

    y = ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
  }

  doc.setFillColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2]);
  doc.rect(12, y, pageWidth - 24, 20, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(220, 252, 231);
  doc.text('NET PAYABLE', 16, y + 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(formatInrPdf(netPayable), 16, y + 16);

  drawPayslipFooter(doc, profile, y + 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, pageHeight - 6, {
    align: 'center',
  });
}
