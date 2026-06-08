'use client';

import type { FormEvent } from 'react';
import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanFormLabel,
  LoanDialogFooter,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormTextareaClass,
} from '@/components/loans/LoanDetailDialogShell';

export type LedgerPaymentFormData = {
  amount: string;
  paymentDate: string;
  payrollCycle: string;
  remarks: string;
};

type LedgerRecordPaymentPanelProps = {
  requestType: 'loan' | 'salary_advance';
  paymentData: LedgerPaymentFormData;
  onChange: (data: LedgerPaymentFormData) => void;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  saving?: boolean;
  emiHint?: number;
  deductionPerCycleHint?: number;
};

export function LedgerRecordPaymentPanel({
  requestType,
  paymentData,
  onChange,
  onSubmit,
  onCancel,
  saving,
  emiHint,
  deductionPerCycleHint,
}: LedgerRecordPaymentPanelProps) {
  const title = requestType === 'loan' ? 'Record EMI payment' : 'Record advance payment';

  return (
    <LoanDetailSection highlight>
      <LoanDetailSectionTitle>{title}</LoanDetailSectionTitle>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <LoanFormLabel>Amount *</LoanFormLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={paymentData.amount}
              onChange={(e) => onChange({ ...paymentData, amount: e.target.value })}
              placeholder="Enter payment amount"
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
            />
            {requestType === 'loan' && emiHint != null && (
              <p className="mt-1 text-xs text-stone-500">EMI amount: ₹{emiHint.toLocaleString()}</p>
            )}
            {requestType === 'salary_advance' && deductionPerCycleHint != null && (
              <p className="mt-1 text-xs text-stone-500">
                Deduction per cycle: ₹{deductionPerCycleHint.toLocaleString()}
              </p>
            )}
          </div>
          <div>
            <LoanFormLabel>Payment date *</LoanFormLabel>
            <input
              type="date"
              required
              value={paymentData.paymentDate}
              onChange={(e) => onChange({ ...paymentData, paymentDate: e.target.value })}
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
            />
          </div>
        </div>

        <div>
          <LoanFormLabel>Payroll cycle (optional)</LoanFormLabel>
          <input
            type="text"
            value={paymentData.payrollCycle}
            onChange={(e) => onChange({ ...paymentData, payrollCycle: e.target.value })}
            placeholder="e.g., 2024-11"
            className={loansFormInputClass()}
            style={loansFormInputStyle()}
          />
        </div>

        <div>
          <LoanFormLabel>Remarks (optional)</LoanFormLabel>
          <textarea
            value={paymentData.remarks}
            onChange={(e) => onChange({ ...paymentData, remarks: e.target.value })}
            placeholder="Add any remarks for this transaction…"
            rows={3}
            className={loansFormTextareaClass()}
            style={loansFormInputStyle()}
          />
        </div>

        <LoanDialogFooter
          onCancel={onCancel}
          submitLabel={saving ? 'Processing…' : 'Record payment'}
          loading={saving}
          submitDisabled={saving}
        />
      </form>
    </LoanDetailSection>
  );
}
