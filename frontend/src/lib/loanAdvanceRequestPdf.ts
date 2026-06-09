import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { resolveEmployeeListDisplayParts } from '@/lib/employeeListDisplay';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import {
  drawLoanApplicationFormPage,
  drawLoanApplicationSuretyPage,
  isLoanPostDisbursement,
  type LoanApplicationPdfContext,
} from '@/lib/loanApplicationFormPdf';
import { drawLoanRtgsPage, shouldIncludeRtgsPage } from '@/lib/loanRtgsPdf';

/** Minimal loan/advance shape for PDF export (matches list/detail payloads). */
export type LoanAdvancePdfLoan = {
  _id: string;
  applicationFormNumber?: number;
  requestType: 'loan' | 'salary_advance';
  amount: number;
  reason?: string;
  remarks?: string;
  duration: number;
  status: string;
  appliedAt: string;
  isActive?: boolean;
  employeeId?: {
    employee_name?: string;
    emp_no?: string;
    email?: string;
    phone_number?: string;
    gross_salary?: number;
    bank_account_no?: string;
    bank_name?: string;
    bank_place?: string;
    ifsc_code?: string;
    department_id?: { name?: string; code?: string } | string;
  };
  emp_no?: string;
  department?: { name?: string; code?: string };
  designation?: { name?: string };
  division_id?: { name?: string; code?: string } | string;
  originalAmount?: number;
  needAmount?: number;
  interestAmount?: number;
  createdAt?: string;
  updatedAt?: string;
  financialYear?: string;
  appliedBy?: { name?: string; email?: string } | string | null;
  loanConfig?: {
    emiAmount?: number;
    interestRate?: number;
    totalAmount?: number;
    totalInterest?: number;
    startDate?: string;
    endDate?: string;
  };
  advanceConfig?: {
    deductionCycles?: number;
    deductionPerCycle?: number;
    deductionStartCycle?: string;
  };
  repayment?: {
    totalPaid?: number;
    remainingBalance?: number;
    installmentsPaid?: number;
    totalInstallments?: number;
    lastPaymentDate?: string;
    nextPaymentDate?: string;
  };
  disbursement?: {
    disbursedAt?: string;
    disbursementMethod?: string;
    transactionReference?: string;
    remarks?: string;
    disbursedBy?: { name?: string; email?: string } | string | null;
  };
  guarantors?: Array<{
    emp_no?: string;
    name?: string;
    status?: string;
    actionAt?: string;
    remarks?: string;
    employeeId?:
      | {
          employee_name?: string;
          emp_no?: string;
          department_id?: { name?: string; code?: string } | string;
        }
      | string;
  }>;
  cancellation?: {
    cancelledAt?: string;
    reason?: string;
    cancelledBy?: { name?: string; email?: string } | string | null;
  };
  changeHistory?: Array<{
    field?: string;
    originalValue?: unknown;
    newValue?: unknown;
    modifiedByName?: string;
    modifiedByRole?: string;
    modifiedAt?: string;
    reason?: string;
    modifiedBy?: { name?: string; email?: string } | string;
  }>;
  workflow?: {
    currentStep?: string;
    nextApprover?: string | null;
    history?: Array<{
      step?: string;
      action?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      timestamp?: string;
      actionBy?: { name?: string; email?: string } | string;
    }>;
  };
  approvals?: {
    hod?: ApprovalSlot;
    manager?: ApprovalSlot;
    hr?: ApprovalSlot;
    final?: ApprovalSlot;
  };
};

type ApprovalSlot = {
  status?: string | null;
  approvedAt?: string;
  comments?: string;
  approvedBy?: { name?: string; email?: string } | string | null;
};

export type LoanAdvancePdfTxn = {
  transactionType: string;
  amount: number;
  transactionDate?: string;
  createdAt?: string;
  payrollCycle?: string;
  payrollSettlementKey?: string;
  remarks?: string;
  processedBy?: { name?: string; email?: string } | string | null;
};

export type LoanAdvancePdfSummary = {
  totalAmount?: number;
  totalPaid?: number;
  remainingBalance?: number;
  installmentsPaid?: number;
  totalInstallments?: number;
  requestType?: string;
};

function primaryRgb(requestType: 'loan' | 'salary_advance'): [number, number, number] {
  return requestType === 'loan' ? [37, 99, 235] : [124, 58, 237];
}

/** Bill-style amounts: Rs. 1,23,456.78 (ASCII-friendly for PDF). */
function formatRs(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso?: string | Date | null): string {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatDateOnly(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

function txnTypeLabel(type: string): string {
  const map: Record<string, string> = {
    disbursement: 'Disbursement',
    emi_payment: 'EMI / installment payment',
    advance_deduction: 'Advance deduction (payroll)',
    adjustment: 'Adjustment',
    refund: 'Refund',
    early_settlement: 'Early settlement',
  };
  return map[type] || type.replace(/_/g, ' ');
}

function slipEffectLabel(transactionType: string): string {
  if (transactionType === 'disbursement') return 'Principal released (outflow to employee)';
  if (transactionType === 'emi_payment' || transactionType === 'advance_deduction') {
    return 'Recovery credited (reduces balance)';
  }
  if (transactionType === 'refund') return 'Refund to employee';
  if (transactionType === 'early_settlement') return 'Early settlement / closure';
  if (transactionType === 'adjustment') return 'Ledger adjustment';
  return 'See transaction type';
}

function processedByLabel(p: LoanAdvancePdfTxn['processedBy']): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  return p.name || p.email || '—';
}

function disbursedByLabel(p: LoanAdvancePdfLoan['disbursement']): string {
  const d = p?.disbursedBy;
  if (!d) return '—';
  if (typeof d === 'string') return d;
  return d.name || d.email || '—';
}

function disbursementMethodReadable(m?: string): string {
  if (!m) return '—';
  const map: Record<string, string> = {
    bank_transfer: 'Bank transfer',
    cash: 'Cash',
    cheque: 'Cheque',
    other: 'Other',
  };
  return map[m] || m.replace(/_/g, ' ');
}

function divisionLine(loan: LoanAdvancePdfLoan): string {
  const d = loan.division_id;
  if (!d) return '';
  if (typeof d === 'string') return d;
  const name = d.name || '';
  const code = d.code ? ` (${d.code})` : '';
  return `${name}${code}`.trim();
}

function stringifyVal(v: unknown, max = 90): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > max ? `${v.slice(0, max)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(v).slice(0, max);
  }
}

function appliedByLabel(p: LoanAdvancePdfLoan['appliedBy']): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  return p.name || p.email || '—';
}

function cancelledByLabel(c: LoanAdvancePdfLoan['cancellation']): string {
  const x = c?.cancelledBy;
  if (!x) return '—';
  if (typeof x === 'string') return x;
  return x.name || x.email || '—';
}

function changeModifiedByLabel(
  ch: NonNullable<LoanAdvancePdfLoan['changeHistory']>[number],
): string {
  if (ch.modifiedByName) return ch.modifiedByName;
  const m = ch.modifiedBy;
  if (!m) return '—';
  if (typeof m === 'string') return m;
  return m.name || m.email || '—';
}

function sortChangeHistory(
  list: LoanAdvancePdfLoan['changeHistory'],
): NonNullable<LoanAdvancePdfLoan['changeHistory']> {
  if (!list?.length) return [];
  return [...list].sort(
    (a, b) => new Date(a.modifiedAt || 0).getTime() - new Date(b.modifiedAt || 0).getTime(),
  );
}

function guarantorLinkedEmployee(g: NonNullable<LoanAdvancePdfLoan['guarantors']>[number]): string {
  if (typeof g.employeeId === 'object' && g.employeeId) {
    const n = g.employeeId.employee_name || g.name || '';
    const e = g.employeeId.emp_no || g.emp_no || '';
    const s = [n, e ? `(${e})` : ''].filter(Boolean).join(' ');
    return s.trim() || '—';
  }
  return '—';
}

function sortTxnsChrono(txns: LoanAdvancePdfTxn[]): LoanAdvancePdfTxn[] {
  return [...txns].sort(
    (a, b) =>
      new Date(a.transactionDate || a.createdAt || 0).getTime() -
      new Date(b.transactionDate || b.createdAt || 0).getTime(),
  );
}

function sortWorkflowHistory(
  history: NonNullable<LoanAdvancePdfLoan['workflow']>['history'],
): NonNullable<typeof history> {
  if (!history?.length) return [];
  return [...history].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime(),
  );
}

/** Plain-language lines for bill slip: bank/cash vs salary payroll. */
function buildSettlementChannelLines(
  loan: LoanAdvancePdfLoan,
  t: LoanAdvancePdfTxn,
  opts?: { compactForSlip?: boolean },
): string[] {
  const compact = opts?.compactForSlip === true;
  const type = t.transactionType || '';
  const lines: string[] = [];

  if (type === 'disbursement') {
    const d = loan.disbursement;
    const mode = disbursementMethodReadable(d?.disbursementMethod);
    lines.push(`Principal was released to the employee by: ${mode}.`);
    if (d?.transactionReference) {
      lines.push(`Bank / UTR / cheque / reference: ${d.transactionReference}`);
    }
    if (d?.disbursedAt) {
      lines.push(`Official disbursement time: ${formatDateTime(d.disbursedAt)}`);
    }
    const by = disbursedByLabel(d as LoanAdvancePdfLoan['disbursement']);
    if (by !== '—') lines.push(`Authorised / processed by: ${by}`);
    if (!compact && d?.remarks) lines.push(`Disbursement note: ${d.remarks}`);
    return lines;
  }

  if (type === 'emi_payment') {
    const pc = (t.payrollCycle || '').trim();
    if (pc) {
      lines.push(
        `Recovered through salary payroll for month "${pc}". Deducted from salary (not a separate cash receipt in this record).`,
      );
    } else {
      lines.push(
        'Recorded without a payroll month key — manual office posting (e.g. bank or cash); see remarks row.',
      );
    }
    if (!compact && t.payrollSettlementKey) {
      lines.push(`Payroll settlement key: ${t.payrollSettlementKey}`);
    }
    if (!compact && t.remarks) lines.push(`Office remarks: ${t.remarks}`);
    return lines;
  }

  if (type === 'advance_deduction') {
    const pc = (t.payrollCycle || '').trim();
    if (pc) {
      lines.push(`Recovered from salary for payroll month "${pc}" (payroll deduction).`);
    } else {
      lines.push('Recorded without payroll month key — may be manual; see remarks row.');
    }
    if (!compact && t.payrollSettlementKey) lines.push(`Settlement reference: ${t.payrollSettlementKey}`);
    if (!compact && t.remarks) lines.push(`Remarks: ${t.remarks}`);
    return lines;
  }

  if (type === 'early_settlement') {
    lines.push('Lump-sum settlement closing the loan balance (see remarks for mode).');
    if (!compact && t.remarks) lines.push(`Remarks: ${t.remarks}`);
    return lines;
  }

  if (type === 'refund') {
    lines.push('Refund entry.');
    if (!compact && t.remarks) lines.push(`Remarks: ${t.remarks}`);
    return lines;
  }

  if (type === 'adjustment') {
    lines.push('Ledger adjustment (correction or alignment).');
    if (!compact && t.remarks) lines.push(`Details: ${t.remarks}`);
    return lines;
  }

  lines.push('See transaction type and remarks row.');
  return lines;
}

function approvalTableBody(loan: LoanAdvancePdfLoan): string[][] {
  const a = loan.approvals;
  if (!a) return [];
  const stages: [string, string][] = [
    ['hod', 'HOD'],
    ['manager', 'Manager'],
    ['hr', 'HR'],
    ['final', 'Final authority'],
  ];
  const map = a as Record<string, ApprovalSlot | undefined>;
  return stages.map(([key, label]) => {
    const slot = map[key];
    const by =
      slot?.approvedBy && typeof slot.approvedBy === 'object'
        ? slot.approvedBy.name || slot.approvedBy.email || '—'
        : '—';
    return [
      label,
      (slot?.status || '—').replace(/_/g, ' '),
      formatDateTime(slot?.approvedAt),
      by,
      (slot?.comments || '—').slice(0, 200),
    ];
  });
}

function safeFilePart(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40);
}

function lastTableBottom(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}

export function appendLoanSimpleDetailsPage(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  options?: { summary?: LoanAdvancePdfSummary },
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const [pr, pg, pb] = primaryRgb(loan.requestType);
  const title =
    loan.requestType === 'loan' ? 'Loan request details' : 'Salary advance request details';
  const employeeDisplay = resolveEmployeeListDisplayParts({
    employeeId: loan.employeeId,
    emp_no: loan.emp_no,
    department: loan.department,
    designation: loan.designation,
    division_id: loan.division_id,
  });
  const empNo = employeeDisplay.empNo || '—';
  const identityPlain =
    [employeeDisplay.name, employeeDisplay.empDesigLine, employeeDisplay.deptDivLine]
      .filter(Boolean)
      .join('  ·  ') || employeeDisplay.name;
  const summary = options?.summary;
  const generated = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const drawHeaderBand = (subtitle?: string) => {
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${generated}`, margin, 20);
    if (subtitle) doc.text(subtitle, margin, 26);
    doc.setTextColor(33, 37, 41);
  };

  // —— Page 1+: Request pack ——
  drawHeaderBand(`Reference: ${loan._id}`);
  let y = 38;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('Employee', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(identityPlain, margin, y);
  y += 5;
  const contactBits = [loan.employeeId?.email, loan.employeeId?.phone_number].filter(Boolean);
  if (contactBits.length) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(contactBits.join('  ·  '), margin, y);
    y += 4;
  }
  const deptName = loan.department?.name;
  const deptCode = loan.department?.code;
  const deptStr = [deptName, deptCode ? `(${deptCode})` : ''].filter(Boolean).join(' ');
  const des = loan.designation?.name;
  const div = divisionLine(loan);
  const orgLine = [deptStr, des].filter(Boolean).join(' · ');
  if (orgLine) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(orgLine, margin, y);
    y += 4;
  }
  if (div) {
    doc.text(`Division: ${div}`, margin, y);
    y += 4;
  }
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Request details', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  const rows: [string, string][] = [
    ['Type', loan.requestType === 'loan' ? 'Loan' : 'Salary advance'],
    ['Status', (loan.status || '—').replace(/_/g, ' ')],
    ['Applied on', formatDateOnly(loan.appliedAt)],
    ['Principal / requested amount', formatRs(loan.amount)],
    ['Tenure (months / cycles)', String(loan.duration ?? '—')],
    ['Reason', loan.reason?.trim() || '—'],
  ];
  if (loan.remarks?.trim()) rows.push(['Application remarks', loan.remarks.trim()]);

  if (loan.requestType === 'loan' && loan.loanConfig) {
    rows.push(['EMI (configured)', formatRs(loan.loanConfig.emiAmount)]);
    rows.push(['Interest rate (%)', loan.loanConfig.interestRate != null ? String(loan.loanConfig.interestRate) : '—']);
    rows.push(['Total repayable (incl. interest)', formatRs(loan.loanConfig.totalAmount ?? loan.amount)]);
    if (loan.loanConfig.totalInterest != null && Number(loan.loanConfig.totalInterest) > 0) {
      rows.push(['Total interest (loan config)', formatRs(loan.loanConfig.totalInterest)]);
    }
    if (loan.interestAmount != null && Number(loan.interestAmount) > 0) {
      rows.push(['Interest (stored on record)', formatRs(loan.interestAmount)]);
    }
    if (loan.loanConfig.startDate) {
      rows.push(['Planned EMI window from', formatDateOnly(String(loan.loanConfig.startDate))]);
    }
    if (loan.loanConfig.endDate) {
      rows.push(['Planned EMI window to', formatDateOnly(String(loan.loanConfig.endDate))]);
    }
  }
  if (loan.requestType === 'salary_advance' && loan.advanceConfig) {
    rows.push(['Deduction per cycle', formatRs(loan.advanceConfig.deductionPerCycle)]);
    rows.push(['Planned deduction cycles', String(loan.advanceConfig.deductionCycles ?? '—')]);
    if (loan.advanceConfig.deductionStartCycle) {
      rows.push(['Deduction start cycle', loan.advanceConfig.deductionStartCycle]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: rows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62, textColor: [71, 85, 105] },
      1: { cellWidth: pageW - margin * 2 - 62 },
    },
  });

  let tableBottom = lastTableBottom(doc, y + 40);
  y = tableBottom + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Record, filing & audit (system)', margin, y);
  y += 6;
  const metaRows: [string, string][] = [
    ['Financial year', loan.financialYear || '—'],
    ['Record created', formatDateTime(loan.createdAt)],
    ['Last updated', formatDateTime(loan.updatedAt)],
    ['Submitted in HRMS by', appliedByLabel(loan.appliedBy)],
    ['Active on file', loan.isActive === false ? 'No' : 'Yes'],
  ];
  if (loan.originalAmount != null) {
    metaRows.push(['Original principal (at application)', formatRs(loan.originalAmount)]);
  }
  if (loan.needAmount != null && Number(loan.needAmount) > 0) {
    metaRows.push(['Higher amount requested (need)', formatRs(loan.needAmount)]);
  }
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: metaRows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62, textColor: [71, 85, 105] },
      1: { cellWidth: pageW - margin * 2 - 62 },
    },
  });
  tableBottom = lastTableBottom(doc, y);
  y = tableBottom + 8;

  if (loan.cancellation && (loan.cancellation.cancelledAt || loan.cancellation.reason)) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Cancellation', margin, y);
    y += 6;
    const cRows: [string, string][] = [
      ['Cancelled at', formatDateTime(loan.cancellation.cancelledAt)],
      ['Cancelled by', cancelledByLabel(loan.cancellation)],
      ['Reason', (loan.cancellation.reason || '—').slice(0, 500)],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: cRows,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 52, textColor: [71, 85, 105] },
        1: { cellWidth: pageW - margin * 2 - 52 },
      },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 8;
  }

  if (loan.disbursement?.disbursedAt || loan.disbursement?.disbursementMethod) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Disbursement (principal release)', margin, y);
    y += 6;
    const dRows: [string, string][] = [
      ['Mode', disbursementMethodReadable(loan.disbursement?.disbursementMethod)],
      ['Date / time', formatDateTime(loan.disbursement?.disbursedAt)],
      ['Bank / UTR / ref.', loan.disbursement?.transactionReference || '—'],
      ['Released by', disbursedByLabel(loan.disbursement)],
      ['Note', loan.disbursement?.remarks || '—'],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      body: dRows,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 52, textColor: [71, 85, 105] },
        1: { cellWidth: pageW - margin * 2 - 52 },
      },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 8;
  }

  if (loan.guarantors && loan.guarantors.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Guarantors', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [['Guarantor name', 'Emp. no.', 'Linked employee', 'Status', 'Action on', 'Comments']],
      body: loan.guarantors.map((g) => [
        (g.name || '—').slice(0, 48),
        g.emp_no || '—',
        guarantorLinkedEmployee(g),
        (g.status || '—').replace(/_/g, ' '),
        formatDateTime(g.actionAt),
        (g.remarks || '—').slice(0, 100),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 8;
  }

  const hist = sortWorkflowHistory(loan.workflow?.history);
  if (hist.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Workflow trail (approvals & actions)', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [['When', 'Step', 'Action', 'By', 'Role', 'Comments']],
      body: hist.map((h) => [
        formatDateTime(h.timestamp),
        (h.step || '—').replace(/_/g, ' '),
        (h.action || '—').replace(/_/g, ' '),
        h.actionByName || (typeof h.actionBy === 'object' ? h.actionBy?.name : '') || '—',
        (h.actionByRole || '—').replace(/_/g, ' '),
        (h.comments || '—').slice(0, 100),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 6;
    if (loan.workflow?.currentStep || loan.workflow?.nextApprover) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Workflow position: step "${(loan.workflow?.currentStep || '—').replace(/_/g, ' ')}" · Next approver role: ${(loan.workflow?.nextApprover || 'none').replace(/_/g, ' ')}`,
        margin,
        y + 4,
        { maxWidth: pageW - margin * 2 },
      );
      y += 10;
    } else {
      y = tableBottom + 8;
    }
  }

  if (loan.approvals) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Formal approval stages', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [['Stage', 'Status', 'Decided on', 'Approver', 'Comments']],
      body: approvalTableBody(loan),
      styles: { fontSize: 8, cellPadding: 1.3 },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 8;
  }

  if (summary || loan.repayment) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Repayment snapshot', margin, y);
    y += 6;
    const repRows: [string, string][] = [];
    if (summary) {
      repRows.push(['Total obligation', formatRs(summary.totalAmount)]);
      repRows.push(['Total recovered / paid', formatRs(summary.totalPaid)]);
      repRows.push(['Balance remaining', formatRs(summary.remainingBalance)]);
      repRows.push(['Installments paid', `${summary.installmentsPaid ?? '—'} / ${summary.totalInstallments ?? '—'}`]);
    } else if (loan.repayment) {
      repRows.push(['Total paid', formatRs(loan.repayment.totalPaid)]);
      repRows.push(['Remaining balance', formatRs(loan.repayment.remainingBalance)]);
      repRows.push([
        'Installments',
        `${loan.repayment.installmentsPaid ?? '—'} / ${loan.repayment.totalInstallments ?? loan.duration ?? '—'}`,
      ]);
      if (loan.repayment.lastPaymentDate) {
        repRows.push(['Last recovery date', formatDateOnly(loan.repayment.lastPaymentDate)]);
      }
      if (loan.repayment.nextPaymentDate) {
        repRows.push(['Next due (if set)', formatDateOnly(loan.repayment.nextPaymentDate)]);
      }
    }
    if (repRows.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        body: repRows,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1.2 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 62, textColor: [71, 85, 105] },
          1: { cellWidth: pageW - margin * 2 - 62 },
        },
      });
      tableBottom = lastTableBottom(doc, y);
      y = tableBottom + 8;
    }
  }

  const changes = sortChangeHistory(loan.changeHistory);
  if (changes.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Field change history (edits after submission)', margin, y);
    y += 4;
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      head: [['When', 'Field', 'Previous', 'New', 'By', 'Role', 'Reason']],
      body: changes.map((c) => [
        formatDateTime(c.modifiedAt),
        (c.field || '—').replace(/_/g, ' '),
        stringifyVal(c.originalValue, 36),
        stringifyVal(c.newValue, 36),
        changeModifiedByLabel(c),
        (c.modifiedByRole || '—').replace(/_/g, ' '),
        (c.reason || '—').slice(0, 48),
      ]),
      styles: { fontSize: 6.8, cellPadding: 1.1 },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    tableBottom = lastTableBottom(doc, y);
    y = tableBottom + 8;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('System record: employee, request, guarantors, approvals and workflow. Amounts in Rs.', margin, doc.internal.pageSize.getHeight() - 10, {
    maxWidth: pageW - margin * 2,
  });
}

function appendLoanLedgerAndSlips(
  doc: jsPDF,
  loan: LoanAdvancePdfLoan,
  transactions: LoanAdvancePdfTxn[],
  options?: { summary?: LoanAdvancePdfSummary },
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const [pr, pg, pb] = primaryRgb(loan.requestType);
  const title = loan.requestType === 'loan' ? 'Loan statement & slips' : 'Salary advance statement & slips';
  const empNo =
    resolveEmployeeListDisplayParts({
      employeeId: loan.employeeId,
      emp_no: loan.emp_no,
      department: loan.department,
      designation: loan.designation,
      division_id: loan.division_id,
    }).empNo || '—';
  const sorted = sortTxnsChrono(transactions);
  const generated = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const drawHeaderBand = (subtitle?: string) => {
    doc.setFillColor(pr, pg, pb);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Generated: ${generated}`, margin, 20);
    if (subtitle) doc.text(subtitle, margin, 26);
    doc.setTextColor(33, 37, 41);
  };

  drawHeaderBand(`Reference: ${loan._id}`);
  let y = 38;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Transaction ledger', margin, y);
  y += 2;

  if (sorted.length === 0) {
    y += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('No ledger transactions recorded for this request yet.', margin, y);
  } else {
    const head = [['#', 'Type', 'Txn date', 'Amount', 'Payroll', 'Ref.', 'By', 'Remarks']];
    const body = sorted.map((t, i) => [
      String(i + 1),
      txnTypeLabel(t.transactionType || ''),
      formatDateTime(t.transactionDate || t.createdAt),
      t.transactionType === 'disbursement' ? `${formatRs(t.amount)} out` : `${formatRs(t.amount)} in`,
      t.payrollCycle || '—',
      (t.payrollSettlementKey || '—').slice(0, 28),
      processedByLabel(t.processedBy),
      (t.remarks || '—').slice(0, 56),
    ]);
    autoTable(doc, {
      startY: y + 4,
      margin: { left: margin, right: margin },
      head,
      body,
      styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [pr, pg, pb], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { cellWidth: 30 },
        6: { cellWidth: 24 },
        7: { cellWidth: 'auto' as unknown as number },
      },
    });
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Ledger and transaction slips. Amounts in Rs.',
    margin,
    pageH - 10,
    {
      maxWidth: pageW - margin * 2,
    },
  );

  // —— Bill slips: one page per transaction ——
  sorted.forEach((t, index) => {
    doc.addPage();
    drawHeaderBand(`Official slip ${index + 1} of ${sorted.length}`);
    doc.setTextColor(15, 23, 42);

    const slipTop = 36;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.line(margin, slipTop, pageW - margin, slipTop);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('TRANSACTION SLIP (BILL COPY)', pageW / 2, slipTop + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Request: ${loan._id}  ·  Employee: ${empNo}`, pageW / 2, slipTop + 13, { align: 'center' });
    doc.line(margin, slipTop + 17, pageW - margin, slipTop + 17);

    const slipPad = margin + 3;
    const slipLabelMaxW = 56;
    const slipValueX = slipPad + slipLabelMaxW + 4;
    const slipValueMaxW = pageW - margin - slipValueX;
    const slipLineH = 4.05;

    const channelText = buildSettlementChannelLines(loan, t, { compactForSlip: true }).join(' ');
    const slipRows: [string, string][] = [
      ['Slip type', txnTypeLabel(t.transactionType || '')],
      ['Effect on loan', slipEffectLabel(t.transactionType || '')],
      ['Transaction date / time', formatDateTime(t.transactionDate || t.createdAt)],
      ['System entry logged', formatDateTime(t.createdAt)],
      ['Amount (Rs.)', formatRs(t.amount)],
      ['Payroll month key', t.payrollCycle || 'Not linked to payroll in this line'],
      ['Payroll settlement ref.', (t.payrollSettlementKey || '—').slice(0, 120)],
      ['Posted in system by', processedByLabel(t.processedBy)],
      ['Channel (how paid)', channelText || '—'],
      ['Office / system remarks', (t.remarks || '—').slice(0, 600)],
    ];

    let estY = slipTop + 22 + 10;
    slipRows.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      const ln = doc.splitTextToSize(k, slipLabelMaxW).length;
      doc.setFont('helvetica', 'normal');
      const vn = doc.splitTextToSize(v, slipValueMaxW).length;
      estY += Math.max(ln, vn) * slipLineH + 2;
    });
    const slipH = Math.min(pageH - slipTop - 28, Math.max(58, estY - slipTop + 14));
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, slipTop + 20, pageW - margin * 2, slipH, 2, 2, 'S');

    let sy = slipTop + 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    slipRows.forEach(([k, v]) => {
      doc.setFont('helvetica', 'bold');
      const labelLines = doc.splitTextToSize(k, slipLabelMaxW);
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(v, slipValueMaxW);
      const n = Math.max(labelLines.length, valueLines.length);
      const rowTop = sy;
      for (let i = 0; i < n; i += 1) {
        const yLine = rowTop + i * slipLineH;
        if (labelLines[i]) {
          doc.setFont('helvetica', 'bold');
          doc.text(labelLines[i], slipPad, yLine);
        }
        if (valueLines[i]) {
          doc.setFont('helvetica', 'normal');
          doc.text(valueLines[i], slipValueX, yLine);
        }
      }
      sy = rowTop + n * slipLineH + 2;
    });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'This slip summarises one ledger line. Disbursements use the mode in Disbursement section; recoveries may be via salary payroll when a payroll month is shown.',
      margin,
      pageH - 16,
      { maxWidth: pageW - margin * 2 },
    );
  });

}

export async function downloadLoanAdvanceRequestPdf(
  loan: LoanAdvancePdfLoan,
  transactions: LoanAdvancePdfTxn[],
  options?: {
    summary?: LoanAdvancePdfSummary;
    applicationPdfContext?: LoanApplicationPdfContext;
  },
): Promise<void> {
  const profile = await fetchCompanyProfile();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pdfContext = options?.applicationPdfContext;

  drawLoanApplicationFormPage(doc, loan, profile, pdfContext);

  doc.addPage();
  drawLoanApplicationSuretyPage(doc, loan, profile, pdfContext);

  if (shouldIncludeRtgsPage(loan)) {
    doc.addPage();
    drawLoanRtgsPage(doc, loan, profile, pdfContext);
  }

  if (isLoanPostDisbursement(loan.status)) {
    doc.addPage();
    appendLoanLedgerAndSlips(doc, loan, transactions, options);
  }

  const empNo =
    resolveEmployeeListDisplayParts({
      employeeId: loan.employeeId,
      emp_no: loan.emp_no,
      department: loan.department,
      designation: loan.designation,
      division_id: loan.division_id,
    }).empNo || 'unknown';
  const prefix = loan.requestType === 'loan' ? 'Loan' : 'SalaryAdvance';
  const formNo =
    loan.applicationFormNumber != null ? `_No${loan.applicationFormNumber}` : '';
  const fname = `${prefix}${formNo}_${safeFilePart(empNo)}_${loan._id.slice(-8)}.pdf`;
  doc.save(fname);
}
