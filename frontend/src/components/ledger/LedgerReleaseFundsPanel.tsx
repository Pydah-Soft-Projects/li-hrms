'use client';

import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  loansDialogPrimaryButtonClass,
  loansDialogPrimaryButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';

type LedgerReleaseFundsPanelProps = {
  amount: number;
  employeeName: string;
  totalRecovery?: number | null;
  onRelease: () => void;
  showAction?: boolean;
};

export function LedgerReleaseFundsPanel({
  amount,
  employeeName,
  totalRecovery,
  onRelease,
  showAction = true,
}: LedgerReleaseFundsPanelProps) {
  const showRecovery =
    totalRecovery != null && Number(totalRecovery) !== Number(amount);

  return (
    <LoanDetailSection highlight>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <LoanDetailSectionTitle className="mb-1">Release funds</LoanDetailSectionTitle>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Transfer ₹{amount.toLocaleString()} to {employeeName} (approved principal).
          </p>
          {showRecovery && (
            <p className="mt-1 text-xs text-stone-500">
              Total to be recovered (principal + interest): ₹{Number(totalRecovery).toLocaleString()}
            </p>
          )}
        </div>
        {showAction && (
          <button
            type="button"
            onClick={onRelease}
            className={`shrink-0 ${loansDialogPrimaryButtonClass()}`}
            style={loansDialogPrimaryButtonStyle()}
          >
            Release funds
          </button>
        )}
      </div>
    </LoanDetailSection>
  );
}
