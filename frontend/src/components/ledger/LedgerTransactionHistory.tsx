'use client';

import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerMoneyClass } from '@/lib/ledgerUi';

export type LedgerTransaction = {
  transactionType?: string;
  amount?: number;
  transactionDate?: string;
  createdAt?: string;
  remarks?: string;
  payrollCycle?: string;
};

function txnTypeLabel(type?: string) {
  return String(type || 'transaction').replace(/_/g, ' ');
}

function txnBadgeStyle(type?: string): React.CSSProperties {
  const t = String(type || '');
  if (t === 'disbursement') {
    return { borderColor: 'rgba(225, 29, 72, 0.25)', backgroundColor: 'rgba(225, 29, 72, 0.08)', color: 'rgb(190 18 60)' };
  }
  if (t === 'emi_payment') {
    return { borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent-ink)' };
  }
  return { borderColor: 'rgba(16, 185, 129, 0.25)', backgroundColor: 'rgba(16, 185, 129, 0.08)', color: 'rgb(4 120 87)' };
}

export function LedgerTransactionHistory({
  transactions,
  loading,
  onRefresh,
}: {
  transactions: LedgerTransaction[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <LoanDetailSection>
      <div className="mb-3 flex items-center justify-between">
        <LoanDetailSectionTitle className="mb-0">Transaction history</LoanDetailSectionTitle>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className={loansDialogOutlineButtonClass()}
            style={loansDialogOutlineButtonStyle()}
          >
            Refresh
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-stone-500">
          <div
            className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--ps-accent)', borderTopColor: 'transparent' }}
          />
          Loading transactions…
        </div>
      ) : transactions.length > 0 ? (
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {transactions.map((txn, idx) => {
            const isDebit = txn.transactionType === 'disbursement';
            const dateSrc = txn.transactionDate || txn.createdAt;
            return (
              <div
                key={idx}
                className="flex items-center justify-between border p-3"
                style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(var(--ps-accent-rgb), 0.02)' }}
              >
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider capitalize"
                    style={txnBadgeStyle(txn.transactionType)}
                  >
                    {txnTypeLabel(txn.transactionType)}
                  </span>
                  {dateSrc && (
                    <p className="mt-1.5 text-xs text-stone-500">
                      {new Date(dateSrc).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {txn.remarks && (
                    <p className="mt-1 text-xs italic text-stone-400">{txn.remarks}</p>
                  )}
                  {txn.payrollCycle && (
                    <p className="mt-0.5 text-xs text-stone-400">Cycle: {txn.payrollCycle}</p>
                  )}
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className={ledgerMoneyClass(isDebit)}>
                    {isDebit ? '−' : '+'}₹{Number(txn.amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-stone-500">No transactions yet</div>
      )}
    </LoanDetailSection>
  );
}
