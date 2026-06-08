import type { PayslipLoanDetail, PayslipLoans, PayslipSections } from '@/lib/api';

type LoanAdvanceLike = {
  totalEMI?: number;
  remainingBalance?: number;
  emiBreakdown?: Array<{ loanId?: string; emiAmount?: number }>;
};

type PayrollLike = {
  payslipLoans?: PayslipLoans;
  payslipSections?: PayslipSections;
  loanAdvance?: LoanAdvanceLike;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const emptyLoans = (): PayslipLoans => ({
  items: [],
  loanDetails: [],
  totalEmiDeducted: 0,
  totalBalanceAfter: 0,
  hasLoans: false,
});

export function formatLoanTakenDate(takenDate?: string | null): string {
  if (!takenDate) return '—';
  const d = new Date(takenDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Single cumulative row for payslip: all active loans combined. */
function collapseToCumulativeLoanDisplay(
  items: NonNullable<PayslipLoans['items']>,
  paysheetEmi: number,
  paysheetRemaining: number
): PayslipLoans['items'] {
  if (!items.length && paysheetEmi <= 0 && paysheetRemaining <= 0) return [];

  const emiDeducted =
    paysheetEmi > 0 ? paysheetEmi : round2(items.reduce((s, i) => s + (i.emiDeducted || 0), 0));

  let balanceBefore = round2(items.reduce((s, i) => s + (i.balanceBefore || 0), 0));
  if (balanceBefore <= 0 && paysheetRemaining > 0) {
    balanceBefore = round2(paysheetRemaining);
  } else if (balanceBefore <= 0 && emiDeducted > 0) {
    const sumAfter = round2(items.reduce((s, i) => s + (i.balanceAfter || 0), 0));
    balanceBefore = round2(sumAfter + emiDeducted);
  }

  let balanceAfter = round2(items.reduce((s, i) => s + (i.balanceAfter || 0), 0));
  if (emiDeducted > 0 && balanceBefore > 0) {
    balanceAfter = round2(Math.max(0, balanceBefore - emiDeducted));
  } else if (balanceAfter <= 0 && paysheetRemaining > 0) {
    balanceAfter = round2(
      emiDeducted > 0 ? Math.max(0, paysheetRemaining - emiDeducted) : paysheetRemaining
    );
  }

  return [
    {
      loanId: '',
      label: 'Loans',
      balanceBefore,
      emiDeducted,
      balanceAfter,
    },
  ];
}

function finalizePayslipLoans(
  items: NonNullable<PayslipLoans['items']>,
  paysheetEmi: number,
  paysheetRemaining: number,
  loanDetails?: PayslipLoanDetail[]
): PayslipLoans {
  const totalEmiDeducted =
    paysheetEmi > 0 ? paysheetEmi : round2(items.reduce((s, i) => s + (i.emiDeducted || 0), 0));
  const cumulativeItems = collapseToCumulativeLoanDisplay(items, paysheetEmi, paysheetRemaining);
  const totalBalanceAfter =
    cumulativeItems.length > 0
      ? round2(cumulativeItems[0].balanceAfter)
      : round2(Math.max(0, (paysheetRemaining > 0 ? paysheetRemaining : 0) - totalEmiDeducted));
  const details = loanDetails && loanDetails.length > 0 ? loanDetails : [];

  return {
    items: cumulativeItems,
    loanDetails: details,
    totalEmiDeducted,
    totalBalanceAfter,
    hasLoans:
      cumulativeItems.length > 0 ||
      details.length > 0 ||
      totalEmiDeducted > 0 ||
      totalBalanceAfter > 0,
  };
}

/** Loan EMI from paysheet column value on deductions section (header "Loan EMI"). */
export function extractPaysheetLoanEmi(payroll: PayrollLike): number {
  const deductions = payroll.payslipSections?.deductions || [];
  const loanEmiCol = deductions.find(
    (d) =>
      String(d.header || '').trim().toLowerCase() === 'loan emi' ||
      /loan\s*emi/i.test(String(d.header || ''))
  );
  if (loanEmiCol != null) {
    const n = Number(loanEmiCol.value);
    if (Number.isFinite(n)) return round2(n);
  }
  const raw = Number(payroll.loanAdvance?.totalEMI);
  return Number.isFinite(raw) ? round2(raw) : 0;
}

function extractPaysheetLoanRemaining(payroll: PayrollLike): number {
  const allItems = [
    ...(payroll.payslipSections?.deductions || []),
    ...(payroll.payslipSections?.earnings || []),
    ...(payroll.payslipSections?.attendance || []),
  ];
  const remainingCol = allItems.find((d) => {
    const h = String(d.header || '').toLowerCase();
    return h.includes('loan') && h.includes('remaining');
  });
  if (remainingCol != null) {
    const n = Number(remainingCol.value);
    if (Number.isFinite(n)) return round2(n);
  }
  const raw = Number(payroll.loanAdvance?.remainingBalance);
  return Number.isFinite(raw) ? round2(raw) : 0;
}

/** Prefer API payslipLoans; fallback uses paysheet Loan EMI column + record loanAdvance. */
export function resolvePayslipLoans(payroll: PayrollLike): PayslipLoans {
  const fromApi = payroll.payslipLoans;
  const paysheetEmi = extractPaysheetLoanEmi(payroll);
  const paysheetRemaining = extractPaysheetLoanRemaining(payroll);

  if (
    fromApi &&
    (fromApi.hasLoans ||
      (fromApi.items?.length ?? 0) > 0 ||
      (fromApi.totalEmiDeducted ?? 0) > 0 ||
      (fromApi.totalBalanceAfter ?? 0) > 0)
  ) {
    return finalizePayslipLoans(
      fromApi.items || [],
      paysheetEmi || (fromApi.totalEmiDeducted ?? 0),
      paysheetRemaining || (fromApi.totalBalanceAfter ?? 0),
      fromApi.loanDetails
    );
  }

  const breakdown = payroll.loanAdvance?.emiBreakdown || [];

  const itemsFromBreakdown = breakdown
    .filter((emi) => emi && Number(emi.emiAmount) > 0)
    .map((emi, i) => {
      const emiDeducted = round2(Number(emi.emiAmount));
      return {
        loanId: emi.loanId != null ? String(emi.loanId) : '',
        label: `Loan ${i + 1}`,
        balanceBefore: 0,
        emiDeducted,
        balanceAfter: 0,
      };
    });

  if (itemsFromBreakdown.length > 0) {
    return finalizePayslipLoans(itemsFromBreakdown, paysheetEmi, paysheetRemaining);
  }

  if (paysheetEmi > 0 || paysheetRemaining > 0) {
    return finalizePayslipLoans(
      [
        {
          loanId: '',
          label: 'Loans',
          balanceBefore: round2(paysheetRemaining),
          emiDeducted: paysheetEmi,
          balanceAfter: round2(Math.max(0, paysheetRemaining - paysheetEmi)),
        },
      ],
      paysheetEmi,
      paysheetRemaining
    );
  }

  return emptyLoans();
}

export function payslipHasLoans(loans?: PayslipLoans): boolean {
  if (!loans) return false;
  return (
    loans.hasLoans ||
    (loans.items?.length ?? 0) > 0 ||
    (loans.loanDetails?.length ?? 0) > 0 ||
    (loans.totalEmiDeducted ?? 0) > 0 ||
    (loans.totalBalanceAfter ?? 0) > 0
  );
}
