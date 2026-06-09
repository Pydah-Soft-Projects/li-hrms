import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyProfile } from '@/lib/companyProfile';
import { formatAddressBlock } from '@/lib/companyProfile';
import type { LoanAdvancePdfLoan } from '@/lib/loanAdvanceRequestPdf';
import {
  buildFormTheme,
  drawApplicantAndHodSections,
  drawFormPageHeader,
  type LoanApplicationPdfContext,
} from '@/lib/loanApplicationFormPdf';

function formatRs(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function isLoanApprovedForDisbursement(status: string): boolean {
  return ['approved', 'disbursed', 'active', 'completed'].includes(status);
}

export function hasRequiredGuarantorConsent(loan: LoanAdvancePdfLoan): boolean {
  if (loan.requestType === 'salary_advance') return true;
  const accepted = (loan.guarantors || []).filter((g) => g.status === 'accepted').length;
  return accepted >= 2;
}

export function shouldIncludeRtgsPage(loan: LoanAdvancePdfLoan): boolean {
  return isLoanApprovedForDisbursement(loan.status) && hasRequiredGuarantorConsent(loan);
}

export function drawLoanRtgsPage(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  profile: CompanyProfile,
  context?: LoanApplicationPdfContext,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const rightX = pageW - margin;
  const contentW = rightX - margin;
  const innerX = margin + 5;
  const innerRight = rightX - 5;
  const innerW = innerRight - innerX;
  const theme = buildFormTheme(profile, loan.requestType);

  const formNo = loan.applicationFormNumber != null ? String(loan.applicationFormNumber) : '—';
  const appTitle =
    loan.requestType === 'salary_advance'
      ? 'APPLICATION FOR SALARY ADVANCE'
      : 'APPLICATION FOR LOAN';

  const headerH = drawFormPageHeader(doc, profile, loan, theme, {
    margin,
    rightX,
    contentW,
    title: appTitle,
    formNo,
  });

  let y = drawApplicantAndHodSections(doc, loan, theme, context, {
    margin,
    contentW,
    innerX,
    innerRight,
    startY: headerH + 5,
  });

  doc.setFillColor(...theme.primary);
  doc.rect(margin, y, contentW, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('RTGS / NEFT PAYMENT ADVICE', pageW / 2, y + 7, { align: 'center' });
  y += 14;

  const employee = loan.employeeId;
  const bankRows: [string, string][] = [
    ['Account holder name', employee?.employee_name || '—'],
    ['Bank name', employee?.bank_name || '—'],
    ['Branch / place', employee?.bank_place || '—'],
    ['Account number', employee?.bank_account_no || '—'],
    ['IFSC code', employee?.ifsc_code || '—'],
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...theme.label);
  doc.text('Bank account details', margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: bankRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.4, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 48, textColor: [71, 85, 105] },
      1: { cellWidth: innerW - 48 },
    },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;

  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentW, 26, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 95, 70);
  doc.text('Amount to be credited', margin + 6, y + 9);
  doc.setFontSize(15);
  doc.setTextColor(4, 120, 87);
  doc.text(formatRs(loan.amount), margin + 6, y + 20);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const companyAddr = formatAddressBlock(profile.addresses.corporate);
  const footer = companyAddr
    ? `For accounts use only · ${profile.legalName || profile.displayName}${companyAddr ? ` · ${companyAddr}` : ''}`
    : 'For accounts use only. Verify bank details before initiating RTGS/NEFT transfer.';
  doc.text(footer, margin, y + 34, { maxWidth: contentW });
}
