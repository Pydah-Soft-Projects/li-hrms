import type jsPDF from 'jspdf';
import type { CompanyProfile } from '@/lib/companyProfile';
import { formatAddressBlock } from '@/lib/companyProfile';
import type { LoanAdvancePdfLoan } from '@/lib/loanAdvanceRequestPdf';

export type LoanApplicationPdfContext = {
  previousAdvance?: {
    amount: number;
    drawnOnDate?: string;
    requestType?: string;
  } | null;
  grossSalary?: number | null;
  /** @deprecated use divisionName */
  sectionName?: string | null;
  divisionName?: string | null;
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
const SECTION_PAD_Y = 6;
const ROW_GAP = 8;
const OFFICIAL_PAD_Y = 4;
const OFFICIAL_ROW_GAP = 3;
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
  const name = (profile.legalName || profile.displayName || 'Company').trim().toUpperCase();
  const addr = formatAddressBlock(profile.addresses.corporate);
  if (!addr) return name;
  return `${name}, ${addr.toUpperCase()}.`;
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
  labelLines.forEach((line, i) => {
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
  fontSize = 10,
): number {
  const maxW = rightX - x;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...theme.label);
  const labelW = doc.getTextWidth(label);

  if (labelW <= maxW * 0.5) {
    doc.text(label, x, y);
    if (value) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...theme.body);
      const valLines = doc.splitTextToSize(value, rightX - x - labelW - 2);
      valLines.forEach((line, i) => {
        doc.text(line, x + labelW + 2, y + i * 4);
      });
      return Math.max(ROW_GAP, valLines.length * 4 + 2);
    }
    return ROW_GAP;
  }

  const labelLines = doc.splitTextToSize(label, maxW);
  labelLines.forEach((line, i) => {
    doc.text(line, x, y + i * 4);
  });
  let cursorY = y + labelLines.length * 4 + 1;

  if (value) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...theme.body);
    const valLines = doc.splitTextToSize(value, maxW);
    valLines.forEach((line, i) => {
      doc.text(line, x, cursorY + i * 4);
    });
    cursorY += valLines.length * 4;
  }

  return Math.max(ROW_GAP, cursorY - y + 2);
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
  drawFieldLine(doc, 'Dept. :', gDept, rowX, deptY, cols.fieldRight, theme, 9.5);

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

  const employeeName = loan.employeeId?.employee_name || '';
  const designation = loan.designation?.name || '';
  const department = loan.department?.name || '';
  const division = context?.divisionName || context?.sectionName || divisionName(loan) || '';
  const amount = formatRsWhole(loan.amount);
  const reason = (loan.reason || '').trim();
  const appliedDate = formatDateForm(loan.appliedAt);

  const employeeSignH = measureSignatureBlockHeight(
    doc,
    'Signature of Employee',
    cols.signLeft,
    cols.signRight,
    10,
  );

  let y = startY;
  const applicantTop = y;
  const applicantH = SECTION_PAD_Y * 2 + ROW_GAP * 6 + employeeSignH;
  drawTintedPanel(doc, margin, applicantTop, contentW, applicantH, theme.primaryPale, theme.primaryLight);

  y = applicantTop + SECTION_PAD_Y;
  drawFieldLine(doc, 'Employee Name :', employeeName, innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Designation :', designation, innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Department :', department, innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Division :', division, innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Amount required : Rs.', amount ? `${amount} /-` : '', innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Reason for Advance :', reason, innerX, y, innerRight, theme);
  y += ROW_GAP;
  drawFieldLine(doc, 'Date :', appliedDate, innerX, y, innerRight, theme);
  y += ROW_GAP;
  y += drawSignatureBlock(doc, {
    label: 'Signature of Employee',
    x: cols.signLeft,
    y,
    rightX: cols.signRight,
    theme,
    fontSize: 10,
    align: 'right',
  });
  y = applicantTop + applicantH + SECTION_GAP;

  if (!includeHod) {
    return y;
  }

  const hodSignH = measureSignatureBlockHeight(doc, HOD_SIGNATURE_LABEL, innerX, innerRight, 9.5);
  const hodTop = y;
  const hodH = SECTION_PAD_Y * 2 + hodSignH;
  drawTintedPanel(
    doc,
    margin,
    hodTop,
    contentW,
    hodH,
    mixRgb(theme.primaryPale, [255, 255, 255], 0.35),
    theme.accent,
  );
  drawSignatureBlock(doc, {
    label: HOD_SIGNATURE_LABEL,
    x: innerX,
    y: hodTop + SECTION_PAD_Y,
    rightX: innerRight,
    theme,
    fontSize: 9.5,
    align: 'center',
  });

  return hodTop + hodH + SECTION_GAP;
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
  const headerH = 28;

  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, pageW, headerH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  const header = companyHeaderLine(profile);
  const headerLines = doc.splitTextToSize(header, contentW);
  headerLines.forEach((line: string, i: number) => {
    doc.text(line, pageW / 2, 9 + i * 4.8, { align: 'center' });
  });

  doc.setFontSize(12);
  doc.text(title, pageW / 2, headerH - 7, { align: 'center' });
  const titleW = doc.getTextWidth(title);
  const titleX = pageW / 2 - titleW / 2;
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.35);
  doc.line(titleX, headerH - 5.5, titleX + titleW, headerH - 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('No.', rightX - 24, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 220, 220);
  doc.text(formNo, rightX - 14, 9);

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

  drawOfficialUseSection(doc, loan, theme, context, {
    pageW,
    margin,
    contentW,
    innerX,
    innerRight,
    startY: y,
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
