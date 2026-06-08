'use client';

import type { ReactNode } from 'react';
import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanFormLabel,
  LoanFormPanel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
  loansDialogDangerButtonClass,
  loansDialogSuccessButtonClass,
} from '@/components/loans/LoanDetailDialogShell';

export type LedgerApprovalValidation = { level: 'warning' | 'error'; message: string } | null;

type LedgerApprovalPanelProps = {
  showAmount?: boolean;
  amount: string;
  onAmountChange: (v: string) => void;
  amountValidation?: LedgerApprovalValidation;
  showLoanTerms?: boolean;
  interestRate: string;
  onInterestRateChange: (v: string) => void;
  duration: string;
  onDurationChange: (v: string) => void;
  recalculationPreview?: ReactNode;
  showUpdateWarning?: boolean;
  onUpdateLoan?: () => void;
  updating?: boolean;
  finalApprovalBlock?: ReactNode;
  comment: string;
  onCommentChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  saving?: boolean;
  approveIcon?: ReactNode;
  rejectIcon?: ReactNode;
};

export function LedgerApprovalPanel({
  showAmount = true,
  amount,
  onAmountChange,
  amountValidation,
  showLoanTerms = false,
  interestRate,
  onInterestRateChange,
  duration,
  onDurationChange,
  recalculationPreview,
  showUpdateWarning,
  onUpdateLoan,
  updating,
  finalApprovalBlock,
  comment,
  onCommentChange,
  onApprove,
  onReject,
  saving,
  approveIcon,
  rejectIcon,
}: LedgerApprovalPanelProps) {
  const amountInvalid = amountValidation?.level === 'error';
  const amountWarn = amountValidation?.level === 'warning';

  return (
    <LoanDetailSection highlight>
      <LoanDetailSectionTitle>Approval</LoanDetailSectionTitle>

      <div className="space-y-4">
        {showAmount && (
          <div>
            <LoanFormLabel>Approval amount (₹)</LoanFormLabel>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              className={loansFormInputClass(amountInvalid || amountWarn)}
              style={loansFormInputStyle(amountInvalid || amountWarn)}
            />
            {amountValidation && (
              <p
                className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                  amountValidation.level === 'error' ? 'text-rose-600' : 'text-amber-700'
                }`}
              >
                {amountValidation.message}
              </p>
            )}
          </div>
        )}

        {showLoanTerms && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <LoanFormLabel>Approval interest rate (%)</LoanFormLabel>
              <input
                type="number"
                step="0.01"
                value={interestRate}
                onChange={(e) => onInterestRateChange(e.target.value)}
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
              />
            </div>
            <div>
              <LoanFormLabel>Duration (months)</LoanFormLabel>
              <input
                type="number"
                min="1"
                value={duration}
                onChange={(e) => onDurationChange(e.target.value)}
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
              />
            </div>
          </div>
        )}

        {recalculationPreview}

        {showUpdateWarning && onUpdateLoan && (
          <LoanFormPanel soft>
            <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              You have modified the loan details. Update the record before approving.
            </p>
            <button
              type="button"
              onClick={onUpdateLoan}
              disabled={updating}
              className="w-full rounded-md border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-amber-900 transition hover:opacity-90 disabled:opacity-40 dark:text-amber-100"
              style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(251, 191, 36, 0.12)' }}
            >
              Update loan with modified values
            </button>
          </LoanFormPanel>
        )}

        {finalApprovalBlock}

        <div>
          <LoanFormLabel>Comment (optional)</LoanFormLabel>
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Add a comment for this approval step…"
            rows={2}
            className={loansFormTextareaClass()}
            style={loansFormInputStyle()}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--ps-accent-border)' }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={saving}
            className={loansDialogSuccessButtonClass()}
          >
            {approveIcon}
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={saving}
            className={loansDialogDangerButtonClass()}
          >
            {rejectIcon}
            Reject
          </button>
        </div>
      </div>
    </LoanDetailSection>
  );
}

export function LedgerLoanRecalculationPreview({
  emi,
  totalInterest,
  totalRepayment,
}: {
  emi: number;
  totalInterest: number;
  totalRepayment: number;
}) {
  return (
    <LoanFormPanel soft className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-stone-500">Monthly EMI (approx)</span>
        <span className="font-mono font-semibold tabular-nums" style={{ color: 'var(--ps-accent)' }}>
          ₹{Math.round(emi).toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-stone-500">Total interest</span>
        <span className="font-mono tabular-nums">₹{Math.round(totalInterest).toLocaleString()}</span>
      </div>
      <div
        className="mt-1 flex items-center justify-between border-t pt-2"
        style={{ borderColor: 'var(--ps-accent-border)' }}
      >
        <span className="font-medium text-stone-700 dark:text-stone-300">Total repayment</span>
        <span className="font-mono text-sm font-bold tabular-nums text-stone-900 dark:text-stone-100">
          ₹{Math.round(totalRepayment).toLocaleString()}
        </span>
      </div>
    </LoanFormPanel>
  );
}

export function LedgerFinalApprovalPayPeriod({
  value,
  onChange,
  options,
  previewLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; range: { from: string; to: string } }>;
  previewLabel?: string;
}) {
  return (
    <LoanFormPanel soft className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
        Final approval
      </p>
      <LoanFormLabel>First deduction pay period *</LoanFormLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={loansFormSelectClass()}
        style={loansFormInputStyle()}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} ({opt.range.from} → {opt.range.to})
          </option>
        ))}
      </select>
      <p className="text-xs text-stone-500">
        Next payment due = end of selected period{previewLabel ? ` (${previewLabel})` : ''}. Payroll deducts from
        this period onward.
      </p>
    </LoanFormPanel>
  );
}
