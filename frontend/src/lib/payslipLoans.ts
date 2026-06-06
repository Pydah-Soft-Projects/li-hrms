import type { PayslipLoans, PayslipSections } from '@/lib/api';

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
  totalEmiDeducted: 0,
  totalBalanceAfter: 0,
  hasLoans: false,
});

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
  if (
    fromApi &&
    (fromApi.hasLoans ||
      (fromApi.items?.length ?? 0) > 0 ||
      (fromApi.totalEmiDeducted ?? 0) > 0 ||
      (fromApi.totalBalanceAfter ?? 0) > 0)
  ) {
    return fromApi;
  }

  const paysheetEmi = extractPaysheetLoanEmi(payroll);
  const paysheetRemaining = extractPaysheetLoanRemaining(payroll);
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
    const totalEmiDeducted =
      paysheetEmi > 0
        ? paysheetEmi
        : round2(itemsFromBreakdown.reduce((s, x) => s + x.emiDeducted, 0));
    return {
      items: itemsFromBreakdown,
      totalEmiDeducted,
      totalBalanceAfter: paysheetRemaining,
      hasLoans: true,
    };
  }

  if (paysheetEmi > 0 || paysheetRemaining > 0) {
    return {
      items: [
        {
          loanId: '',
          label: 'Loan',
          balanceBefore: round2(paysheetRemaining + paysheetEmi),
          emiDeducted: paysheetEmi,
          balanceAfter: paysheetRemaining,
        },
      ],
      totalEmiDeducted: paysheetEmi,
      totalBalanceAfter: paysheetRemaining,
      hasLoans: true,
    };
  }

  return emptyLoans();
}

export function payslipHasLoans(loans?: PayslipLoans): boolean {
  if (!loans) return false;
  return (
    loans.hasLoans ||
    (loans.items?.length ?? 0) > 0 ||
    (loans.totalEmiDeducted ?? 0) > 0 ||
    (loans.totalBalanceAfter ?? 0) > 0
  );
}
