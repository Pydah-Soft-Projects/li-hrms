'use client';

import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanDetailField,
} from '@/components/loans/LoanDetailDialogShell';

export type LoanExposureRow = {
  loanId: string;
  applicationFormNumber?: number | null;
  requestType: string;
  borrowerName?: string | null;
  borrowerEmpNo?: string | null;
  amount: number;
  emi: number;
  outstanding: number;
  status: string;
  isRunning: boolean;
  guarantorStatus?: string | null;
  totalAmount?: number;
  interest?: number;
  paidMonths?: number;
  paidAmount?: number;
  unpaidAmount?: number;
  totalMonths?: number;
  reason?: string;
};

export type LoanEmployeeExposure = {
  ownLoans?: LoanExposureRow[];
  guaranteedLoans?: LoanExposureRow[];
  totals?: {
    ownOutstanding?: number;
    guaranteedOutstanding?: number;
    totalLiability?: number;
    ownEmi?: number;
    guaranteedEmi?: number;
    totalMonthlyExposure?: number;
  };
};

function formatRs(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
}

function ExposureTable({ rows, showBorrower }: { rows: LoanExposureRow[]; showBorrower?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
      <table className="w-full text-[11px] text-slate-600 dark:text-slate-400 border-collapse">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {showBorrower && <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">Borrower</th>}
            <th className={`px-2.5 py-2 font-semibold whitespace-nowrap ${showBorrower ? 'text-right' : 'text-left'}`}>Total Repayment</th>
            <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">EMI</th>
            <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">Interest</th>
            <th className="px-2.5 py-2 text-center font-semibold whitespace-nowrap">Paid Months</th>
            <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">Paid Amount</th>
            <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">Unpaid Amount</th>
            <th className="px-2.5 py-2 text-center font-semibold whitespace-nowrap">Months</th>
            <th className="px-2.5 py-2 text-center font-semibold whitespace-nowrap">Status</th>
            <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.loanId} className="border-b border-slate-100 dark:border-slate-800/40 last:border-0 hover:bg-slate-100/10 dark:hover:bg-slate-800/10">
              {showBorrower && (
                <td className="px-2.5 py-2 text-left text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {row.borrowerName} ({row.borrowerEmpNo})
                </td>
              )}
              <td className={`px-2.5 py-2 text-slate-800 dark:text-slate-200 font-medium whitespace-nowrap ${showBorrower ? 'text-right' : 'text-left'}`}>{formatRs(row.totalAmount || row.amount)}</td>
              <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">{formatRs(row.emi)}</td>
              <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">{formatRs(row.interest)}</td>
              <td className="px-2.5 py-2 text-center whitespace-nowrap">{row.paidMonths || 0} / {row.totalMonths || 0}</td>
              <td className="px-2.5 py-2 text-slate-700 dark:text-slate-300 text-right whitespace-nowrap">{formatRs(row.paidAmount)}</td>
              <td className="px-2.5 py-2 font-semibold text-amber-600 dark:text-amber-400 text-right whitespace-nowrap">{formatRs(row.unpaidAmount || row.outstanding)}</td>
              <td className="px-2.5 py-2 text-center font-medium whitespace-nowrap">{row.totalMonths || 0}</td>
              <td className="px-2.5 py-2 text-center capitalize whitespace-nowrap">{row.status?.replace(/_/g, ' ')}</td>
              <td className="px-2.5 py-2 text-left text-slate-800 dark:text-slate-200 font-medium max-w-[150px] truncate" title={row.reason}>
                {row.reason || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LoanEmployeeExposureSections({
  exposure,
}: {
  exposure: LoanEmployeeExposure | null | undefined;
}) {
  const ownLoans = (exposure?.ownLoans || []) as LoanExposureRow[];
  const guaranteedLoans = (exposure?.guaranteedLoans || []) as LoanExposureRow[];
  const totals = exposure?.totals;

  return (
    <>
      <LoanDetailSection soft>
        <LoanDetailSectionTitle>Existing loans (as borrower)</LoanDetailSectionTitle>
        {ownLoans.length ? (
          <ExposureTable rows={ownLoans} />
        ) : (
          <p className="text-sm text-slate-500">No prior loan records.</p>
        )}
      </LoanDetailSection>

      <LoanDetailSection soft>
        <LoanDetailSectionTitle>Loans as guarantor</LoanDetailSectionTitle>
        {guaranteedLoans.length ? (
          <ExposureTable rows={guaranteedLoans} showBorrower />
        ) : (
          <p className="text-sm text-slate-500">Not standing as guarantor on any loan.</p>
        )}
      </LoanDetailSection>

      {totals && (
        <LoanDetailSection highlight>
          <LoanDetailSectionTitle>Total liability summary</LoanDetailSectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <LoanDetailField label="Own outstanding">{formatRs(totals.ownOutstanding)}</LoanDetailField>
            <LoanDetailField label="Guaranteed outstanding">
              {formatRs(totals.guaranteedOutstanding)}
            </LoanDetailField>
            <LoanDetailField label="Total liability">
              <span className="font-bold text-rose-600">{formatRs(totals.totalLiability)}</span>
            </LoanDetailField>
            <LoanDetailField label="Own EMI">{formatRs(totals.ownEmi)}</LoanDetailField>
            <LoanDetailField label="Guaranteed EMI">{formatRs(totals.guaranteedEmi)}</LoanDetailField>
            <LoanDetailField label="Monthly exposure">
              <span className="font-bold">{formatRs(totals.totalMonthlyExposure)}</span>
            </LoanDetailField>
          </div>
        </LoanDetailSection>
      )}
    </>
  );
}
