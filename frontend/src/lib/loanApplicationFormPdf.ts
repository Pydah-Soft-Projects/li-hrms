import type jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanyProfile } from '@/lib/companyProfile';
import { formatAddressBlock } from '@/lib/companyProfile';
import type { LoanAdvancePdfLoan } from '@/lib/loanAdvanceRequestPdf';
import { loanAttendanceShowsPayableShifts } from '@/lib/loanAttendanceUi';

export type LoanApplicationPdfContext = {
  previousAdvance?: {
    amount: number;
    drawnOnDate?: string;
    requestType?: string;
    outstanding?: number | null;
    emi?: number | null;
    status?: string;
  } | null;
  grossSalary?: number | null;
  /** @deprecated use divisionName */
  sectionName?: string | null;
  divisionName?: string | null;
  employeeExposure?: {
    ownLoans?: Array<{
      amount: number;
      emi: number;
      outstanding: number;
      status: string;
      requestType?: string;
      applicationFormNumber?: number;
      totalAmount?: number;
      interest?: number;
      paidMonths?: number;
      paidAmount?: number;
      unpaidAmount?: number;
      totalMonths?: number;
      reason?: string;
    }>;
    guaranteedLoans?: Array<{ borrowerName?: string; borrowerEmpNo?: string; amount: number; emi: number; outstanding: number; status: string }>;
    totals?: {
      ownOutstanding: number;
      guaranteedOutstanding: number;
      totalLiability: number;
      ownEmi: number;
      guaranteedEmi: number;
      totalMonthlyExposure: number;
    };
  } | null;
  attendanceSummary?: {
    last6Months?: Array<{
      monthName: string;
      workingDays: number;
      present: number;
      payableShifts?: number;
      leave: number;
      lop: number;
      attendancePercent: number | null;
    }>;
    overallPercentage?: number | null;
    isMultiShift?: boolean;
    processingMode?: string;
    totalPayableShifts?: number;
  } | null;
};

type FormTheme = {
  primary: [number, number, number];
  primaryLight: [number, number, number];
  primaryPale: [number, number, number];
  accent: [number, number, number];
  label: [number, number, number];
  body: [number, number, number];
  line: [number, number, number];
};

const SECTION_PAD_X = 5;
const SECTION_PAD_Y = 4;
const ROW_GAP = 6.5;
const OFFICIAL_PAD_Y = 3;
const OFFICIAL_ROW_GAP = 2;
/** Blank area above the signature label for wet ink */
const SIGNATURE_SPACE = 5;
const SIGN_COL_W = 48;
const SIGN_COL_GAP = 8;
const SIGN_EDGE_INSET = 2;
const SIGN_COL_SHIFT = 6;

function contentColumns(innerX: number, innerRight: number) {
  const signRight = innerRight - SIGN_EDGE_INSET;
  const signLeft = signRight - SIGN_COL_W + SIGN_COL_SHIFT;
  const fieldRight = signLeft - SIGN_COL_GAP;
  return { fieldLeft: innerX, fieldRight, signLeft, signRight };
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '').trim();
  if (!raw) return [37, 99, 235];
  const h =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [37, 99, 235];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function buildFormTheme(profile: CompanyProfile, requestType: LoanAdvancePdfLoan['requestType']): FormTheme {
  const defaultHex = requestType === 'loan' ? '#2563eb' : '#7c3aed';
  const primary = hexToRgb(profile.branding?.primaryColor || defaultHex);

  return {
    primary,
    primaryLight: mixRgb(primary, [255, 255, 255], 0.72),
    primaryPale: mixRgb(primary, [255, 255, 255], 0.92),
    accent: mixRgb(primary, [255, 255, 255], 0.35),
    label: mixRgb(primary, [30, 41, 59], 0.55),
    body: [30, 41, 59],
    line: mixRgb(primary, [148, 163, 184], 0.45),
  };
}

function formatRsWhole(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatDateForm(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function companyHeaderLine(profile: CompanyProfile): string {
  const rawName = (profile.legalName || profile.displayName || '').trim();
  const name = (rawName.toUpperCase() === 'HRMS' || !rawName) ? '' : rawName.toUpperCase();
  const rawAddr = formatAddressBlock(profile.addresses.corporate).trim();
  const addr = (rawAddr.toUpperCase() === 'INDIA' || rawAddr.toUpperCase() === 'INDIA.' || !rawAddr) ? '' : rawAddr.toUpperCase();

  if (name && addr) return `${name}, ${addr}.`;
  if (name) return `${name}.`;
  if (addr) return `${addr}.`;
  return '';
}

function approvalSigner(slot?: {
  status?: string | null;
  approvedAt?: string;
  approvedBy?: { name?: string; email?: string } | string | null;
}): string {
  if (!slot || slot.status !== 'approved') return '';
  const by = slot.approvedBy;
  if (!by) return '';
  if (typeof by === 'string') return by;
  const name = by.name || by.email || '';
  const date = slot.approvedAt ? formatDateForm(slot.approvedAt) : '';
  return date ? `${name}  (${date})` : name;
}

function measureSignatureBlockHeight(
  doc: jsPDF,
  label: string,
  blockX: number,
  rightX: number,
  fontSize: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const labelLines = doc.splitTextToSize(label, rightX - blockX);
  const labelH = labelLines.length * 4;
  return SIGNATURE_SPACE + labelH + 4 + 2;
}

/** Blank signing space + signature label only (no name / emp no under signature). */
function drawSignatureBlock(
  doc: jsPDF,
  opts: {
    label: string;
    x: number;
    y: number;
    rightX: number;
    theme: FormTheme;
    fontSize?: number;
    align?: 'left' | 'right' | 'center';
  },
): number {
  const { label, x, y, rightX, theme, fontSize = 9.5, align = 'right' } = opts;
  const startY = y;
  const colW = rightX - x;
  const textAnchor = align === 'right' ? rightX : align === 'center' ? (x + rightX) / 2 : x;
  const textAlign = align === 'right' ? ('right' as const) : align === 'center' ? ('center' as const) : ('left' as const);
  let cy = y + SIGNATURE_SPACE;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...theme.label);
  const labelLines = doc.splitTextToSize(label, colW);
  labelLines.forEach((line: string, i: number) => {
    doc.text(line, textAnchor, cy + i * 4, { align: textAlign });
  });
  cy += labelLines.length * 4 + 2;

  return cy - startY + 2;
}

function installmentPerMonth(loan: LoanAdvancePdfLoan): string {
  if (loan.requestType === 'loan') {
    return formatRsWhole(loan.loanConfig?.emiAmount);
  }
  return formatRsWhole(loan.advanceConfig?.deductionPerCycle);
}

function drawTintedPanel(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  _fill: [number, number, number],
  border: [number, number, number],
): void {
  if (h <= 0) return;
  doc.setDrawColor(...border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
}

/** Label + value row with standard spacing (no underlines). Returns row height used. */
function measureFieldLineHeight(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  rightX: number,
  fontSize: number,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const maxW = rightX - x;
  const labelW = doc.getTextWidth(label);

  if (labelW <= maxW * 0.5) {
    if (!value) return ROW_GAP;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    const valLines = doc.splitTextToSize(value, rightX - x - labelW - 2);
    return Math.max(ROW_GAP, valLines.length * 4 + 2);
  }

  const labelLines = doc.splitTextToSize(label, maxW);
  let h = labelLines.length * 4 + 1;
  if (value) {
    doc.setFont('helvetica', 'normal');
    const valLines = doc.splitTextToSize(value, maxW);
    h += valLines.length * 4;
  }
  return Math.max(ROW_GAP, h + 2);
}

function drawFieldLine(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  rightX: number,
  theme: FormTheme,
  fontSize = 9,
): number {
  const maxW = rightX - x;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...theme.label);
  const labelW = doc.getTextWidth(label);
  const lineH = Math.max(3.0, fontSize * 0.42);
  const minGap = lineH + 1.2;

  if (labelW <= maxW * 0.48) {
    doc.text(label, x, y);
    if (value) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...theme.body);
      const valW = rightX - x - labelW - 1.5;
      const valLines = doc.splitTextToSize(value, valW);
      valLines.forEach((line: string, i: number) => {
        doc.text(line, x + labelW + 1.5, y + i * lineH);
      });
      return Math.max(minGap, valLines.length * lineH + 1.2);
    }
    return minGap;
  }

  const labelLines = doc.splitTextToSize(label, maxW);
  labelLines.forEach((line: string, i: number) => {
    doc.text(line, x, y + i * lineH);
  });
  let cursorY = y + labelLines.length * lineH;

  if (value) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.body);
    const valLines = doc.splitTextToSize(value, maxW);
    valLines.forEach((line: string, i: number) => {
      doc.text(line, x, cursorY + i * lineH);
    });
    cursorY += valLines.length * lineH;
  }

  return Math.max(minGap, cursorY - y + 1.2);
}

function drawOfficialUseDivider(
  doc: jsPDF,
  y: number,
  pageW: number,
  margin: number,
  theme: FormTheme,
): void {
  const centerX = pageW / 2;
  const boxW = 52;
  const boxH = 7;
  const boxX = centerX - boxW / 2;
  const lineY = y + boxH / 2;

  doc.setDrawColor(...theme.primaryLight);
  doc.setLineWidth(0.45);
  doc.line(margin, lineY, boxX - 2, lineY);
  doc.line(boxX + boxW + 2, lineY, pageW - margin, lineY);

  doc.setFillColor(...theme.primaryPale);
  doc.setDrawColor(...theme.primary);
  doc.setLineWidth(0.35);
  doc.rect(boxX, y, boxW, boxH, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...theme.primary);
  doc.text('FOR OFFICIAL USE ONLY', centerX, y + 4.8, { align: 'center' });
}

const HOD_SIGNATURE_LABEL = 'Signature of Division Incharge / Head of Department';

export function isLoanFullyApproved(status: string): boolean {
  return ['approved', 'disbursed', 'active', 'completed'].includes(status);
}

function recoveryModeText(loan: LoanAdvancePdfLoan): string {
  const instAmt = installmentPerMonth(loan);
  if (instAmt && loan.duration) {
    return `Deduction from salary   Installments @ Rs. ${instAmt} /- per month (${loan.duration} months)`;
  }
  if (instAmt) {
    return `Deduction from salary   Installments @ Rs. ${instAmt} /- per month`;
  }
  return 'Deduction from salary';
}

function sanctionedAmountDisplay(loan: LoanAdvancePdfLoan): string {
  if (!isLoanFullyApproved(loan.status)) return '';
  const amt = formatRsWhole(loan.amount);
  return amt ? `${amt} /-` : '';
}

function guarantorConsentLabel(
  g: NonNullable<LoanAdvancePdfLoan['guarantors']>[number] | undefined,
): string {
  if (!g || !g.status || g.status === 'pending') return 'Pending';
  const date = g.actionAt ? formatDateForm(g.actionAt) : '';
  const status = g.status.charAt(0).toUpperCase() + g.status.slice(1);
  return date ? `${status} (${date})` : status;
}

function guarantorDept(
  g: NonNullable<LoanAdvancePdfLoan['guarantors']>[number] | undefined,
): string {
  if (!g) return '';
  const emp = g.employeeId;
  if (emp && typeof emp === 'object') {
    const dept = (emp as { department_id?: { name?: string } | string }).department_id;
    if (dept && typeof dept === 'object' && dept.name) return dept.name;
  }
  return '';
}

function guarantorPhone(
  g: NonNullable<LoanAdvancePdfLoan['guarantors']>[number] | undefined,
): string {
  if (!g) return '';
  const emp = g.employeeId;
  if (emp && typeof emp === 'object') {
    return emp.phone_number || emp.alt_phone_number || '';
  }
  return '';
}

export function resolveLoanPrintEmployee(loan: LoanAdvancePdfLoan): {
  name: string;
  empNo: string;
  phone: string;
} {
  const emp = loan.employeeId;
  return {
    name: emp?.employee_name || '',
    empNo: loan.emp_no || emp?.emp_no || '',
    phone: emp?.phone_number || emp?.alt_phone_number || '',
  };
}

function drawGuarantorRow(
  doc: jsPDF,
  index: number,
  g: NonNullable<LoanAdvancePdfLoan['guarantors']>[number] | undefined,
  innerX: number,
  y: number,
  innerRight: number,
  theme: FormTheme,
): number {
  const gName = g?.name || (typeof g?.employeeId === 'object' ? g.employeeId?.employee_name : '') || '';
  const gEmp = g?.emp_no || (typeof g?.employeeId === 'object' ? g.employeeId?.emp_no : '') || '';
  const gDept = guarantorDept(g);
  const gPhone = g?.phone_number || guarantorPhone(g);
  const consent = guarantorConsentLabel(g);
  const cols = contentColumns(innerX, innerRight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...theme.primary);
  doc.text(`${index}.`, cols.fieldLeft, y);

  const rowX = cols.fieldLeft + 5;
  const midX = rowX + (cols.fieldRight - rowX) * 0.52;
  drawFieldLine(doc, 'Name :', gName, rowX, y, midX - 2, theme, 9.5);
  drawFieldLine(doc, 'E.No. :', gEmp, midX, y, cols.fieldRight, theme, 9.5);

  const deptY = y + ROW_GAP;
  drawFieldLine(doc, 'Dept. :', gDept, rowX, deptY, midX - 2, theme, 9.5);
  drawFieldLine(doc, 'Phone :', gPhone, midX, deptY, cols.fieldRight, theme, 9.5);

  const consentY = deptY + ROW_GAP;
  drawFieldLine(doc, 'Consent :', consent, rowX, consentY, cols.fieldRight, theme, 9.5);

  const signH = drawSignatureBlock(doc, {
    label: 'Signature',
    x: cols.signLeft,
    y,
    rightX: cols.signRight,
    theme,
    fontSize: 9.5,
    align: 'right',
  });

  return y + Math.max(ROW_GAP * 3 + 2, signH) + 2;
}

function measureGuarantorRowHeight(
  doc: jsPDF,
  innerX: number,
  innerRight: number,
): number {
  const cols = contentColumns(innerX, innerRight);
  const signH = measureSignatureBlockHeight(doc, 'Signature', cols.signLeft, cols.signRight, 9.5);
  return Math.max(ROW_GAP * 3 + 2, signH) + 2;
}

function measureSuretyPanelHeight(doc: jsPDF, innerW: number, innerX: number, innerRight: number): number {
  const suretyText =
    'We will be held responsible for the above installment loan (Advance) repayment, if the Applicant fails to pay.';
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  const suretyLabelW = doc.getTextWidth('Surety : ');
  const suretyLines = doc.splitTextToSize(suretyText, innerW - suretyLabelW);
  const introH = 4 + Math.max(0, suretyLines.length - 1) * 4.2 + 8;
  const guarantorRowH = measureGuarantorRowHeight(doc, innerX, innerRight);
  return SECTION_PAD_Y * 2 + introH + guarantorRowH * 2 + 2;
}

const SECTION_GAP = 5;

/** Employee fields + employee signature; optional HOD signature block. */
export function drawApplicantAndHodSections(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  theme: FormTheme,
  context: LoanApplicationPdfContext | undefined,
  layout: {
    margin: number;
    contentW: number;
    innerX: number;
    innerRight: number;
    startY: number;
    includeHod?: boolean;
  },
): number {
  const { margin, contentW, innerX, innerRight, startY, includeHod = true } = layout;
  const cols = contentColumns(innerX, innerRight);

  const { name: employeeName, empNo, phone: mobileNumber } = resolveLoanPrintEmployee(loan);
  const designation = loan.designation?.name || '';
  const department = loan.department?.name || '';
  const division = context?.divisionName || context?.sectionName || divisionName(loan) || '';
  const amount = formatRsWhole(loan.amount);
  const reason = (loan.reason || '').trim();
  const appliedDate = formatDateForm(loan.appliedAt);

  const midX = innerX + (innerRight - innerX) * 0.5;
  const empSigH = measureSignatureBlockHeight(doc, 'Signature of Employee', innerX, midX - 2, 8.5);
  const hodSigH = measureSignatureBlockHeight(doc, HOD_SIGNATURE_LABEL, midX, innerRight, 8.5);
  const employeeSignH = Math.max(empSigH, hodSigH);

  const fs = 8.5;
  const padY = 2.5;
  const applicantTop = startY;
  let curY = applicantTop + padY + 1;

  // Row 1
  let h1 = drawFieldLine(doc, 'Employee Name :', employeeName, innerX, curY, midX - 2, theme, fs);
  let h2 = drawFieldLine(doc, 'Emp No :', empNo, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 2
  h1 = drawFieldLine(doc, 'Designation :', designation, innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Division :', division, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 3
  h1 = drawFieldLine(doc, 'Department :', department, innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Mobile Number :', mobileNumber, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 4
  h1 = drawFieldLine(doc, 'Amount required : Rs.', amount ? `${amount} /-` : '', innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Date :', appliedDate, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 5
  h1 = drawFieldLine(doc, 'Reason for Advance :', reason || '—', innerX, curY, innerRight, theme, fs);
  curY += h1;

  const sigY = curY + 1;

  if (includeHod) {
    drawSignatureBlock(doc, {
      label: 'Signature of Employee',
      x: innerX,
      y: sigY,
      rightX: midX - 2,
      theme,
      fontSize: 8.5,
      align: 'center',
    });
    drawSignatureBlock(doc, {
      label: HOD_SIGNATURE_LABEL,
      x: midX,
      y: sigY,
      rightX: innerRight,
      theme,
      fontSize: 8.5,
      align: 'center',
    });
  } else {
    drawSignatureBlock(doc, {
      label: 'Signature of Employee',
      x: cols.signLeft,
      y: sigY,
      rightX: cols.signRight,
      theme,
      fontSize: 8.5,
      align: 'right',
    });
  }

  const applicantH = sigY + employeeSignH - applicantTop + 1;
  drawTintedPanel(doc, margin, applicantTop, contentW, applicantH, theme.primaryPale, theme.primaryLight);

  return applicantTop + applicantH + 3;
}

export function drawFormPageHeader(
  doc: jsPDF,
  profile: CompanyProfile,
  loan: LoanAdvancePdfLoan,
  theme: FormTheme,
  opts: {
    margin: number;
    rightX: number;
    contentW: number;
    title: string;
    formNo: string;
  },
): number {
  const { margin, rightX, contentW, title, formNo } = opts;
  const pageW = doc.internal.pageSize.getWidth();
  const header = companyHeaderLine(profile);
  const headerH = header ? 19 : 14;

  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageW, headerH, 'F');

  if (header) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    const headerLines = doc.splitTextToSize(header, contentW - 35);
    headerLines.forEach((line: string, i: number) => {
      doc.text(line, pageW / 2, 5.5 + i * 3.8, { align: 'center' });
    });

    doc.setFontSize(10.5);
    doc.text(title, pageW / 2, headerH - 3.5, { align: 'center' });
    const titleW = doc.getTextWidth(title);
    const titleX = pageW / 2 - titleW / 2;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.35);
    doc.line(titleX, headerH - 2.5, titleX + titleW, headerH - 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Form No.', rightX - 24, 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 220, 220);
    doc.text(formNo, rightX - 11, 5.5);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageW / 2, headerH / 2 + 1.5, { align: 'center' });
    const titleW = doc.getTextWidth(title);
    const titleX = pageW / 2 - titleW / 2;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.35);
    doc.line(titleX, headerH / 2 + 2.5, titleX + titleW, headerH / 2 + 2.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Form No.', rightX - 24, headerH / 2 + 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 220, 220);
    doc.text(formNo, rightX - 11, headerH / 2 + 1.5);
  }

  return headerH;
}

function officialUseFieldRows(
  loan: LoanAdvancePdfLoan,
  context: LoanApplicationPdfContext | undefined,
): Array<{ label: string; value: string }> {
  const showSanctioned = isLoanFullyApproved(loan.status);
  const prev = context?.previousAdvance;
  const prevAmt = prev?.amount != null ? `${formatRsWhole(prev.amount)} /-` : '';
  const prevDate = formatDateForm(prev?.drawnOnDate);
  const gross = context?.grossSalary != null ? `${formatRsWhole(context.grossSalary)} /-` : '';

  const rows: Array<{ label: string; value: string }> = [
    {
      label: 'Details of Previous Advance (if any) : Rs.',
      value: prevAmt ? `${prevAmt}   drawn on date : ${prevDate}` : '',
    },
    { label: 'Gross Salary Rs.', value: gross },
  ];

  if (showSanctioned) {
    rows.push({ label: 'Amount sanctioned Rs.', value: sanctionedAmountDisplay(loan) });
  }

  rows.push({
    label: 'Mode of Recovery (Deduction form salary) :',
    value: recoveryModeText(loan),
  });
  rows.push({ label: 'HR Dept.', value: approvalSigner(loan.approvals?.hr) });
  rows.push({ label: 'Accounts Dept.', value: '' });
  rows.push({ label: "MD's Sanction", value: approvalSigner(loan.approvals?.final) });

  return rows;
}

function measureOfficialFieldRowHeight(
  doc: jsPDF,
  label: string,
  value: string,
  innerX: number,
  innerRight: number,
): number {
  if (!value) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const labelLines = doc.splitTextToSize(label, innerRight - innerX);
    return Math.max(4, labelLines.length * 4 + 1);
  }
  return measureFieldLineHeight(doc, label, value, innerX, innerRight, 9);
}

function measureOfficialUsePanelHeight(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  context: LoanApplicationPdfContext | undefined,
  innerX: number,
  innerRight: number,
): number {
  const rows = officialUseFieldRows(loan, context);
  let h = OFFICIAL_PAD_Y * 2 + 2;
  rows.forEach((row, i) => {
    h += measureOfficialFieldRowHeight(doc, row.label, row.value, innerX, innerRight);
    if (i < rows.length - 1) h += OFFICIAL_ROW_GAP;
  });
  return h;
}

function drawAttendanceSummaryBlock(
  doc: jsPDF,
  theme: FormTheme,
  context: LoanApplicationPdfContext | undefined,
  layout: { margin: number; contentW: number; innerX: number; innerRight: number; startY: number },
): number {
  const summary = context?.attendanceSummary;
  if (!summary?.last6Months?.length) return layout.startY;

  const showPayable = loanAttendanceShowsPayableShifts(summary);

  let y = layout.startY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...theme.label);
  const overallLabel =
    summary.overallPercentage != null ? `Overall: ${summary.overallPercentage}%` : 'Overall: —';
  doc.text(`Attendance Summary (Last 6 Months) — ${overallLabel}`, layout.innerX, y);
  y += 2.5;

  const headers = showPayable
    ? ['Month', 'Working Days', 'Present', 'Payable Shifts', 'Leave', 'LOP', 'Attendance %']
    : ['Month', 'Working Days', 'Present', 'Leave', 'LOP', 'Attendance %'];
  const body = summary.last6Months.map((row) => {
    const base = [
      row.monthName || '',
      String(row.workingDays ?? '0'),
      String(row.present ?? '0'),
    ];
    if (showPayable) base.push(String(row.payableShifts ?? '0'));
    base.push(
      String(row.leave ?? '0'),
      String(row.lop ?? '0'),
      row.attendancePercent != null ? `${row.attendancePercent}%` : '—',
    );
    return base;
  });

  autoTable(doc, {
    head: [headers],
    body: body,
    startY: y,
    margin: { left: layout.innerX, right: layout.margin },
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: theme.primaryLight,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: theme.primaryPale,
      textColor: theme.primary,
      fontStyle: 'bold',
    },
    columnStyles: showPayable
      ? {
          0: { halign: 'left', fontStyle: 'bold' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center', fontStyle: 'bold' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center', fontStyle: 'bold' },
        }
      : {
          0: { halign: 'left', fontStyle: 'bold' },
          1: { halign: 'center' },
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center', fontStyle: 'bold' },
        },
  });

  return (doc as any).lastAutoTable.finalY + 4;
}

function drawExistingLoansTable(
  doc: jsPDF,
  theme: FormTheme,
  context: LoanApplicationPdfContext | undefined,
  layout: { margin: number; contentW: number; innerX: number; innerRight: number; startY: number },
): number {
  const ownLoans = context?.employeeExposure?.ownLoans;
  if (!ownLoans || ownLoans.length === 0) return layout.startY;

  let y = layout.startY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...theme.label);
  doc.text('Existing Loans (As Borrower)', layout.innerX, y);
  y += 2.5;

  const headers = [
    'No / Type',
    'Total Amt',
    'EMI',
    'Interest',
    'Paid / Total',
    'Paid Amt',
    'Outstanding',
    'Status',
    'Reason',
  ];

  const body = ownLoans.map((row) => {
    const formStr = row.applicationFormNumber != null ? `#${row.applicationFormNumber}` : '';
    const typeStr = row.requestType === 'salary_advance' ? 'Adv' : 'Loan';
    const label = `${typeStr} ${formStr}`.trim();
    return [
      label || 'Loan',
      formatRsWhole(row.totalAmount || row.amount),
      formatRsWhole(row.emi),
      formatRsWhole(row.interest),
      `${row.paidMonths || 0} / ${row.totalMonths || 0}`,
      formatRsWhole(row.paidAmount),
      formatRsWhole(row.unpaidAmount || row.outstanding),
      row.status?.replace(/_/g, ' ') || '',
      row.reason || '—',
    ];
  });

  autoTable(doc, {
    head: [headers],
    body: body,
    startY: y,
    margin: { left: layout.innerX, right: layout.margin },
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: theme.primaryLight,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: theme.primaryPale,
      textColor: theme.primary,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'left', fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] },
      7: { halign: 'center' },
      8: { halign: 'left' },
    },
  });

  return (doc as any).lastAutoTable.finalY + 4;
}

function drawLiabilitySummaryBlock(
  doc: jsPDF,
  theme: FormTheme,
  context: LoanApplicationPdfContext | undefined,
  layout: { innerX: number; innerRight: number; startY: number },
): number {
  const exp = context?.employeeExposure;
  if (!exp?.totals) return layout.startY;

  let y = layout.startY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...theme.label);
  doc.text('Total Liability Summary', layout.innerX, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...theme.body);
  const line = `Own Outstanding: Rs. ${formatRsWhole(exp.totals.ownOutstanding)}   |   Guaranteed Outstanding: Rs. ${formatRsWhole(exp.totals.guaranteedOutstanding)}   |   Total Liability: Rs. ${formatRsWhole(exp.totals.totalLiability)}   |   Monthly Exposure (EMI): Rs. ${formatRsWhole(exp.totals.totalMonthlyExposure)}`;
  doc.text(line, layout.innerX, y);

  return y + 4;
}

function drawOfficialUseSection(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  theme: FormTheme,
  context: LoanApplicationPdfContext | undefined,
  layout: {
    pageW: number;
    margin: number;
    contentW: number;
    innerX: number;
    innerRight: number;
    startY: number;
  },
): number {
  const { pageW, margin, contentW, innerX, innerRight, startY } = layout;
  const rows = officialUseFieldRows(loan, context);

  let y = startY;
  drawOfficialUseDivider(doc, y, pageW, margin, theme);
  y += 8;

  const officialTop = y;
  const officialH = measureOfficialUsePanelHeight(doc, loan, context, innerX, innerRight);
  drawTintedPanel(doc, margin, officialTop, contentW, officialH, [255, 255, 255], theme.primaryLight);

  y = officialTop + OFFICIAL_PAD_Y;
  rows.forEach((row, i) => {
    if (!row.value) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...theme.label);
      const labelLines = doc.splitTextToSize(row.label, innerRight - innerX);
      labelLines.forEach((line: string, li: number) => {
        doc.text(line, innerX, y + li * 4);
      });
      y += measureOfficialFieldRowHeight(doc, row.label, '', innerX, innerRight);
    } else {
      y += drawFieldLine(doc, row.label, row.value, innerX, y, innerRight, theme, 9);
    }
    if (i < rows.length - 1) y += OFFICIAL_ROW_GAP;
  });

  return officialTop + officialH;
}

/** Page 2: applicant block + surety / consent + official use (incl. mode of recovery). */
export function drawLoanApplicationSuretyPage(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  profile: CompanyProfile,
  context?: LoanApplicationPdfContext,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const rightX = pageW - margin;
  const contentW = rightX - margin;
  const theme = buildFormTheme(profile, loan.requestType);
  const innerX = margin + SECTION_PAD_X;
  const innerRight = rightX - SECTION_PAD_X;
  const innerW = innerRight - innerX;
  const formNo = loan.applicationFormNumber != null ? String(loan.applicationFormNumber) : '—';
  const title =
    loan.requestType === 'salary_advance'
      ? 'APPLICATION FOR SALARY ADVANCE'
      : 'APPLICATION FOR LOAN';

  const headerH = drawFormPageHeader(doc, profile, loan, theme, {
    margin,
    rightX,
    contentW,
    title,
    formNo,
  });

  let y = drawApplicantAndHodSections(doc, loan, theme, context, {
    margin,
    contentW,
    innerX,
    innerRight,
    startY: headerH + 5,
    includeHod: false,
  });

  if (loan.requestType === 'loan') {
    const suretyTop = y;
    const suretyH = measureSuretyPanelHeight(doc, innerW, innerX, innerRight);
    drawTintedPanel(
      doc,
      margin,
      suretyTop,
      contentW,
      suretyH,
      mixRgb(theme.primaryPale, [255, 255, 255], 0.35),
      theme.accent,
    );

    y = suretyTop + SECTION_PAD_Y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...theme.primary);
    doc.text('Surety :', innerX, y);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...theme.body);
    const suretyText =
      'We will be held responsible for the above installment loan (Advance) repayment, if the Applicant fails to pay.';
    const suretyLabelW = doc.getTextWidth('Surety : ');
    const suretyLines = doc.splitTextToSize(suretyText, innerW - suretyLabelW);
    suretyLines.forEach((line: string, i: number) => {
      if (i === 0) {
        doc.text(line, innerX + suretyLabelW, y, { maxWidth: innerW - suretyLabelW });
      } else {
        y += 4.2;
        doc.text(line, innerX, y, { maxWidth: innerW });
      }
    });
    y += 8;

    const guarantors = loan.guarantors || [];
    for (let i = 0; i < 2; i += 1) {
      y = drawGuarantorRow(doc, i + 1, guarantors[i], innerX, y, innerRight, theme);
    }
    y = suretyTop + suretyH + 3;
  }

  const officialH = measureOfficialUsePanelHeight(doc, loan, context, innerX, innerRight);
  const totalRequired = 8 + officialH + 5;
  if (y + totalRequired > 281) {
    doc.addPage();
    const newHeaderH = drawFormPageHeader(doc, profile, loan, theme, {
      margin,
      rightX,
      contentW,
      title,
      formNo,
    });
    y = newHeaderH + 5;
  }

  drawOfficialUseSection(doc, loan, theme, context, {
    pageW,
    margin,
    contentW,
    innerX,
    innerRight,
    startY: y,
  });
}

export function drawLoanApplicationFormPage(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  profile: CompanyProfile,
  context?: LoanApplicationPdfContext,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const rightX = pageW - margin;
  const contentW = rightX - margin;
  const theme = buildFormTheme(profile, loan.requestType);

  const innerX = margin + SECTION_PAD_X;
  const innerRight = rightX - SECTION_PAD_X;

  const formNo = loan.applicationFormNumber != null ? String(loan.applicationFormNumber) : '—';

  const title =
    loan.requestType === 'salary_advance' ? 'APPLICATION FOR SALARY ADVANCE' : 'APPLICATION FOR LOAN';

  const headerH = drawFormPageHeader(doc, profile, loan, theme, {
    margin,
    rightX,
    contentW,
    title,
    formNo,
  });

  const y = drawApplicantAndHodSections(doc, loan, theme, context, {
    margin,
    contentW,
    innerX,
    innerRight,
    startY: headerH + 5,
  });

  const layoutBase = { pageW, margin, contentW, innerX, innerRight };
  let nextY = drawAttendanceSummaryBlock(doc, theme, context, { ...layoutBase, startY: y });
  nextY = drawExistingLoansTable(doc, theme, context, { ...layoutBase, startY: nextY });
  nextY = drawLiabilitySummaryBlock(doc, theme, context, { innerX, innerRight, startY: nextY });

  const officialH = measureOfficialUsePanelHeight(doc, loan, context, innerX, innerRight);
  const totalRequired = 8 + officialH + 5;
  if (nextY + totalRequired > 281) {
    doc.addPage();
    const newHeaderH = drawFormPageHeader(doc, profile, loan, theme, {
      margin,
      rightX,
      contentW,
      title,
      formNo,
    });
    nextY = newHeaderH + 5;
  }

  drawOfficialUseSection(doc, loan, theme, context, {
    ...layoutBase,
    startY: nextY,
  });
}

function divisionName(loan: LoanAdvancePdfLoan): string {
  const d = loan.division_id;
  if (!d) return '';
  if (typeof d === 'string') return d;
  return d.name || '';
}

export function isLoanPostDisbursement(status: string): boolean {
  return ['disbursed', 'active', 'completed'].includes(status);
}

export function drawLoanApplicationSimplePageA5(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  profile: CompanyProfile,
  context?: LoanApplicationPdfContext,
): void {
  const pageW = 148;
  const pageH = 210;
  const margin = 8;
  const rightX = pageW - margin;
  const contentW = rightX - margin;
  const theme = buildFormTheme(profile, loan.requestType);
  const innerX = margin + 2.5;
  const innerRight = rightX - 2.5;
  const midX = innerX + (innerRight - innerX) * 0.5;

  const formNo = loan.applicationFormNumber != null ? String(loan.applicationFormNumber) : '—';
  const isLoan = loan.requestType === 'loan';
  const title = isLoan ? 'APPLICATION FOR LOAN' : 'APPLICATION FOR SALARY ADVANCE';

  // 1. Clean Header Banner
  const header = companyHeaderLine(profile);
  const headerH = header ? 15 : 12;
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageW, headerH, 'F');

  if (header) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    const headerLines = doc.splitTextToSize(header, contentW - 25);
    headerLines.forEach((line: string, i: number) => {
      doc.text(line, pageW / 2, 4.8 + i * 3.2, { align: 'center' });
    });

    doc.setFontSize(9);
    doc.text(title, pageW / 2, headerH - 3, { align: 'center' });
    const titleW = doc.getTextWidth(title);
    const titleX = pageW / 2 - titleW / 2;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.line(titleX, headerH - 2.2, titleX + titleW, headerH - 2.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Form No.', rightX - 20, 4.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 220, 220);
    doc.text(formNo, rightX - 8, 4.8);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageW / 2, headerH / 2 + 1.2, { align: 'center' });
    const titleW = doc.getTextWidth(title);
    const titleX = pageW / 2 - titleW / 2;
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.line(titleX, headerH / 2 + 2.2, titleX + titleW, headerH / 2 + 2.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Form No.', rightX - 20, headerH / 2 + 1.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 220, 220);
    doc.text(formNo, rightX - 8, headerH / 2 + 1.2);
  }

  let y = headerH + 3;

  // 2. Decreased Size Basic Details Panel (Dynamic Height, 5 distinct rows)
  const { name: employeeName, empNo, phone: mobileNumber } = resolveLoanPrintEmployee(loan);
  const designation = loan.designation?.name || '';
  const department = loan.department?.name || '';
  const division = context?.divisionName || context?.sectionName || divisionName(loan) || '';
  const amount = formatRsWhole(loan.amount);
  const reason = (loan.reason || '').trim();
  const appliedDate = formatDateForm(loan.appliedAt);
  const emiOrDeduction = installmentPerMonth(loan);

  const panelTop = y;
  const fs = 7.5;
  const padY = 2;
  let curY = panelTop + padY + 0.5;

  // Row 1: Employee Name & Emp No
  let h1 = drawFieldLine(doc, 'Name :', employeeName, innerX, curY, midX - 2, theme, fs);
  let h2 = drawFieldLine(doc, 'Emp No :', empNo, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 2: Department & Designation
  h1 = drawFieldLine(doc, 'Department :', department, innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Designation :', designation, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 3: Division & Mobile
  h1 = drawFieldLine(doc, 'Division :', division, innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Mobile :', mobileNumber, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 4: Amount & Date
  const amtLabel = isLoan ? 'Loan Amount :' : 'Advance Amount :';
  h1 = drawFieldLine(doc, `${amtLabel} Rs.`, amount ? `${amount} /-` : '', innerX, curY, midX - 2, theme, fs);
  h2 = drawFieldLine(doc, 'Date :', appliedDate, midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  // Row 5: Tenure/EMI & Reason
  if (isLoan && loan.duration) {
    h1 = drawFieldLine(doc, 'Tenure/EMI :', `${loan.duration}M @ Rs.${emiOrDeduction}/mo`, innerX, curY, midX - 2, theme, fs);
  } else if (emiOrDeduction) {
    h1 = drawFieldLine(doc, 'Deduction :', `Rs.${emiOrDeduction}/mo`, innerX, curY, midX - 2, theme, fs);
  } else {
    h1 = drawFieldLine(doc, 'Status :', (loan.status || '').toUpperCase(), innerX, curY, midX - 2, theme, fs);
  }
  h2 = drawFieldLine(doc, 'Reason :', reason || '—', midX, curY, innerRight, theme, fs);
  curY += Math.max(h1, h2);

  const basicH = curY - panelTop + padY;
  drawTintedPanel(doc, margin, panelTop, contentW, basicH, theme.primaryPale, theme.primaryLight);

  y = panelTop + basicH + 3;

  // 3. Existing Loans (As Borrower) - MAXIMIZED TABLE SPACE BELOW BASIC DETAILS
  const ownLoans = context?.employeeExposure?.ownLoans || [];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...theme.label);
  doc.text('Existing Loans (As Borrower)', innerX, y);
  y += 2.2;

  if (ownLoans.length > 0) {
    const headers = ['#', 'Type / Form', 'Loan Amt', 'EMI', 'Paid/Total', 'Balance', 'Status'];
    const body = ownLoans.map((row, idx) => {
      const formStr = row.applicationFormNumber != null ? `#${row.applicationFormNumber}` : '';
      const typeStr = row.requestType === 'salary_advance' ? 'Adv' : 'Loan';
      const label = `${typeStr} ${formStr}`.trim();
      return [
        String(idx + 1),
        label,
        formatRsWhole(row.totalAmount || row.amount),
        formatRsWhole(row.emi),
        `${row.paidMonths || 0}/${row.totalMonths || 0}`,
        formatRsWhole(row.unpaidAmount || row.outstanding),
        row.status?.replace(/_/g, ' ') || '',
      ];
    });

    autoTable(doc, {
      head: [headers],
      body: body,
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: 1.5,
        font: 'helvetica',
        textColor: [30, 41, 59],
        lineColor: theme.primaryLight,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: theme.primaryPale,
        textColor: theme.primary,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 6 },
        1: { halign: 'left', fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'center' },
        5: { halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] },
        6: { halign: 'center' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 3;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No existing active loans as borrower.', innerX, y + 2);
    y += 6;
  }

  // 4. Official Sanction & Signatures Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...theme.primary);
  doc.text('Official Sanction & Approvals', innerX, y);
  y += 2.5;

  const showSanctioned = isLoanFullyApproved(loan.status);
  const sancAmt = showSanctioned ? sanctionedAmountDisplay(loan) : '';
  const recMode = recoveryModeText(loan);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...theme.body);
  if (sancAmt) {
    doc.text(`Sanctioned Amount: Rs. ${sancAmt}`, innerX, y);
    y += 3;
  }
  doc.text(`Recovery: ${recMode}`, innerX, y, { maxWidth: contentW });
  y += 5;

  // Wet ink signature lines
  const sigBoxW = (contentW - 6) / 2;
  const sigY = y + 6;
  doc.setDrawColor(...theme.line);
  doc.setLineWidth(0.3);
  doc.line(innerX, sigY, innerX + sigBoxW, sigY);
  doc.line(midX + 3, sigY, innerRight, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...theme.label);
  doc.text('Signature of Employee', innerX + sigBoxW / 2, sigY + 3, { align: 'center' });
  doc.text('Signature of HOD / Sanctioning Auth.', midX + 3 + sigBoxW / 2, sigY + 3, { align: 'center' });
}
