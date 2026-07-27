'use client';

type EmiApplicationPreview = {
  policy?: {
    multiEmiCollectionMode?: string;
    multiEmiPriority?: string;
    maxCombinedEmiAmount?: number | null;
    preEmiInterestEnabled?: boolean;
    accrueInterestOnSkippedEmi?: boolean;
  };
  interestStartPayrollMonth?: string;
  emiCommencePayrollMonth?: string;
  commenceDelayMonths?: number;
  reason?: string;
  existingActiveLoans?: number;
  existingMonthlyEmi?: number;
  preEmiMonths?: number;
  tenureInterest?: number;
  preEmiInterest?: number;
  totalInterest?: number;
  totalAmount?: number;
  emiAmount?: number;
  interestRate?: number;
  principal?: number;
  duration?: number;
};

function formatRs(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
}

function policyModeLabel(mode?: string) {
  switch (mode) {
    case 'single_emi_only':
      return 'Single EMI only per payroll';
    case 'max_combined_cap':
      return 'Max combined EMI cap';
    case 'collect_all':
      return 'Collect all due EMIs';
    default:
      return mode || '—';
  }
}

export default function LoanApplyEmiPolicyPreview({
  preview,
  loading,
}: {
  preview: EmiApplicationPreview | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
        Calculating EMI commence &amp; policy impact…
      </div>
    );
  }
  if (!preview) return null;

  const delayed = (preview.commenceDelayMonths || 0) > 0 || (preview.preEmiMonths || 0) > 0;
  const policy = preview.policy || {};

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <h4 className="mb-3 text-sm font-semibold text-blue-900 dark:text-blue-100">Loan calculation (application)</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-slate-600 dark:text-slate-400">Principal</span>
            <span className="font-medium">{formatRs(preview.principal)}</span>
          </div>
          {(preview.interestRate || 0) > 0 && (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-400">Interest rate</span>
                <span className="font-medium">{preview.interestRate}% p.a.</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-400">Tenure interest</span>
                <span className="font-medium">{formatRs(preview.tenureInterest)}</span>
              </div>
              {(preview.preEmiMonths || 0) > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600 dark:text-slate-400">
                    Pre-EMI interest ({preview.preEmiMonths} mo)
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {formatRs(preview.preEmiInterest)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-400">Total interest</span>
                <span className="font-medium">{formatRs(preview.totalInterest)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-400">Total repayment</span>
                <span className="font-medium">{formatRs(preview.totalAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between gap-3 border-t border-blue-200 pt-2 dark:border-blue-800">
            <span className="font-semibold text-blue-900 dark:text-blue-100">EMI / month</span>
            <span className="font-bold text-blue-900 dark:text-blue-100">{formatRs(preview.emiAmount)}</span>
          </div>
        </div>
      </div>

      <div
        className={`rounded-lg border p-4 text-sm ${
          delayed
            ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
        }`}
      >
        <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          EMI commence (auto from policy)
        </h4>
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Interest start</div>
            <div className="font-medium">{preview.interestStartPayrollMonth || '—'}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">EMI commence</div>
            <div className="font-semibold">{preview.emiCommencePayrollMonth || '—'}</div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{preview.reason}</p>
        {(preview.preEmiMonths || 0) > 0 && policy.preEmiInterestEnabled !== false && (
          <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            Because EMI starts {preview.preEmiMonths} month(s) after interest start, pre-EMI interest{' '}
            {formatRs(preview.preEmiInterest)} is included in the total and EMI above.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900/50">
        <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Company EMI policy</h4>
        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <li>
            Collection: <span className="font-medium text-slate-800 dark:text-slate-200">{policyModeLabel(policy.multiEmiCollectionMode)}</span>
          </li>
          {policy.multiEmiCollectionMode === 'max_combined_cap' && (
            <li>
              Max combined EMI:{' '}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {formatRs(policy.maxCombinedEmiAmount)}
              </span>
            </li>
          )}
          {(policy.multiEmiCollectionMode === 'single_emi_only' ||
            policy.multiEmiCollectionMode === 'max_combined_cap') && (
            <li>
              Priority:{' '}
              <span className="font-medium capitalize text-slate-800 dark:text-slate-200">
                {(policy.multiEmiPriority || 'oldest_first').replace(/_/g, ' ')}
              </span>
            </li>
          )}
          <li>
            Accrue interest if EMI skipped:{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {policy.accrueInterestOnSkippedEmi === false ? 'OFF' : 'ON'}
            </span>
          </li>
          <li>
            Pre-EMI interest:{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {policy.preEmiInterestEnabled === false ? 'OFF' : 'ON'}
            </span>
          </li>
          <li>
            Your other disbursed/active loans: {preview.existingActiveLoans || 0}
            {(preview.existingMonthlyEmi || 0) > 0
              ? ` (≈${formatRs(preview.existingMonthlyEmi)} EMI / month)`
              : ''}
            <span className="block text-slate-400">Pending / approved (not disbursed) loans are not counted.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export type { EmiApplicationPreview };
