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
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function ExposureTable({ rows, showBorrower }: { rows: LoanExposureRow[]; showBorrower?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
            <th className="px-2 py-2">Ref</th>
            {showBorrower && <th className="px-2 py-2">Borrower</th>}
            <th className="px-2 py-2">Amount</th>
            <th className="px-2 py-2">EMI</th>
            <th className="px-2 py-2">Outstanding</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.loanId} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-2 py-2">{row.applicationFormNumber || row.loanId.slice(-6)}</td>
              {showBorrower && (
                <td className="px-2 py-2">
                  {row.borrowerName} ({row.borrowerEmpNo})
                </td>
              )}
              <td className="px-2 py-2">{formatRs(row.amount)}</td>
              <td className="px-2 py-2">{formatRs(row.emi)}</td>
              <td className="px-2 py-2">{formatRs(row.outstanding)}</td>
              <td className="px-2 py-2 capitalize">{row.status?.replace(/_/g, ' ')}</td>
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
