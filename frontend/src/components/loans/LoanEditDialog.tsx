'use client';

import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import {
  type LeaveODPayPeriodOption,
  payPeriodSelectValueToMonthKey,
  payrollMonthKeyToPayPeriodSelectValue,
} from '@/lib/payPeriodRange';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDialogFooter,
  LoanDialogModeTabs,
  LoanFormInfo,
  LoanFormLabel,
  LoanFormPanel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
} from '@/components/loans/LoanDetailDialogShell';

export interface LoanEditTarget {
  _id: string;
  requestType: 'loan' | 'salary_advance';
  status: string;
  amount: number;
  duration: number;
  reason?: string;
  remarks?: string;
  employeeId?: { gross_salary?: number; employee_name?: string };
  loanConfig?: {
    interestRate?: number;
    emiAmount?: number;
    totalAmount?: number;
    totalInterest?: number;
  };
  advanceConfig?: {
    deductionStartCycle?: string;
    deductionPerCycle?: number;
    deductionCycles?: number;
  };
  repayment?: {
    totalPaid?: number;
    remainingBalance?: number;
    installmentsPaid?: number;
    totalInstallments?: number;
  };
  approvals?: {
    final?: { firstDeductionPayrollMonth?: string };
  };
  changeHistory?: Array<{
    field: string;
    originalValue: unknown;
    newValue: unknown;
    modifiedByName?: string;
    modifiedAt?: string;
    reason?: string;
  }>;
}

interface LoanEditDialogProps {
  loan: LoanEditTarget;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: LoanEditTarget) => void;
  eligibilityData?: {
    attendancePercentage: number;
    daysWorked: number;
    daysElapsedInMonth: number;
    proratedAmount: number;
    eligibleAmount: number;
    finalMaxAllowed: number;
  } | null;
  defaultInterestRate?: number;
  isInterestApplicable?: boolean;
  payPeriodOptions?: LeaveODPayPeriodOption[];
  /** Open payroll month — resolves `__default__` in the pay-period dropdown (same as final approval). */
  presentPayrollMonthKey?: string | null;
}

const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected'];

function canEditFinancials(status: string, role: string | undefined) {
  if (CLOSED_STATUSES.includes(status)) return false;
  if (['super_admin', 'hr', 'sub_admin'].includes(role || '')) return true;
  return !['approved', 'disbursed', 'active'].includes(status);
}

function buildPayPeriodOptions(count = 6): LeaveODPayPeriodOption[] {
  const opts: LeaveODPayPeriodOption[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1 + i;
    const adjY = y + Math.floor((m - 1) / 12);
    const adjM = ((m - 1) % 12) + 1;
    const value = `${adjY}-${String(adjM).padStart(2, '0')}`;
    const label = new Date(adjY, adjM - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
    const from = `${adjY}-${String(adjM).padStart(2, '0')}-01`;
    const lastDay = new Date(adjY, adjM, 0).getDate();
    const to = `${adjY}-${String(adjM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    opts.push({ value, label, range: { from, to } });
  }
  return opts;
}

/** Map stored YYYY-MM (or empty) to a dropdown value that exists in pay-period options. */
function storedMonthKeyToPayPeriodSelectValue(
  monthKey: string | undefined | null,
  periodOpts: LeaveODPayPeriodOption[]
): string {
  const stored = String(monthKey || '').trim();
  if (/^\d{4}-\d{2}$/.test(stored)) {
    const full = payrollMonthKeyToPayPeriodSelectValue(stored);
    if (periodOpts.some((o) => o.value === full)) return full;
    return full;
  }
  if (periodOpts.some((o) => o.value === '__default__')) return '__default__';
  return periodOpts[0]?.value || '';
}

export default function LoanEditDialog({
  loan,
  open,
  onClose,
  onSaved,
  eligibilityData,
  defaultInterestRate = 0,
  isInterestApplicable = false,
  payPeriodOptions,
  presentPayrollMonthKey,
}: LoanEditDialogProps) {
  const user = auth.getUser();
  const role = user?.role;
  const isSuperAdmin = role === 'super_admin';
  const financialEditable = canEditFinancials(loan.status, role);
  const isActiveLoan = ['disbursed', 'active', 'approved'].includes(loan.status);
  const isPostDisbursement = ['disbursed', 'active'].includes(loan.status);
  const canRepaymentCorrection = isPostDisbursement && ['super_admin', 'hr', 'sub_admin', 'manager'].includes(role || '');

  const totalRecoverable =
    loan.requestType === 'loan'
      ? Number(loan.loanConfig?.totalAmount) > 0
        ? Number(loan.loanConfig?.totalAmount)
        : Number(loan.amount)
      : Number(loan.amount);

  const [editMode, setEditMode] = useState<'terms' | 'repayment'>('terms');

  const [form, setForm] = useState({
    amount: '',
    duration: '',
    reason: '',
    remarks: '',
    interestRate: '',
    firstDeductionPayrollMonth: '',
    deductionStartCycle: '',
    changeReason: '',
    recalculate: true,
    status: '',
  });
  const [repaymentForm, setRepaymentForm] = useState({
    totalPaid: '',
    installmentsPaid: '',
    remainingBalance: '',
    totalInstallments: '',
    changeReason: '',
    remarks: '',
  });
  const [saving, setSaving] = useState(false);

  const periodOpts = payPeriodOptions?.length ? payPeriodOptions : buildPayPeriodOptions();

  useEffect(() => {
    if (!open) return;
    setForm({
      amount: String(loan.amount ?? ''),
      duration: String(loan.duration ?? ''),
      reason: loan.reason || '',
      remarks: loan.remarks || '',
      interestRate: String(loan.loanConfig?.interestRate ?? defaultInterestRate ?? 0),
      firstDeductionPayrollMonth: storedMonthKeyToPayPeriodSelectValue(
        loan.approvals?.final?.firstDeductionPayrollMonth,
        periodOpts
      ),
      deductionStartCycle: storedMonthKeyToPayPeriodSelectValue(
        loan.advanceConfig?.deductionStartCycle,
        periodOpts
      ),
      changeReason: '',
      recalculate: isActiveLoan,
      status: loan.status,
    });
    const totalInst = loan.repayment?.totalInstallments ?? loan.duration;
    setRepaymentForm({
      totalPaid: loan.repayment?.totalPaid != null ? String(loan.repayment.totalPaid) : '',
      installmentsPaid: loan.repayment?.installmentsPaid != null ? String(loan.repayment.installmentsPaid) : '',
      remainingBalance: loan.repayment?.remainingBalance != null ? String(loan.repayment.remainingBalance) : '',
      totalInstallments: String(totalInst),
      changeReason: '',
      remarks: loan.remarks || '',
    });
    setEditMode(canRepaymentCorrection ? 'repayment' : 'terms');
  }, [open, loan._id, loan.amount, loan.duration, loan.status, canRepaymentCorrection, presentPayrollMonthKey]);

  const storedLoanDeductionMonth = String(loan.approvals?.final?.firstDeductionPayrollMonth || '').trim();
  const storedAdvanceDeductionMonth = String(loan.advanceConfig?.deductionStartCycle || '').trim();
  const selectedLoanDeductionMonth =
    payPeriodSelectValueToMonthKey(form.firstDeductionPayrollMonth, presentPayrollMonthKey) || '';
  const selectedAdvanceDeductionMonth =
    payPeriodSelectValueToMonthKey(form.deductionStartCycle, presentPayrollMonthKey) || '';

  const preview = useMemo(() => {
    const principal = parseFloat(form.amount);
    const duration = parseInt(form.duration, 10);
    if (!principal || !duration) return null;
    if (loan.requestType === 'salary_advance') {
      const perCycle = Math.round(principal / duration);
      const totalPaid = Number(loan.repayment?.totalPaid) || 0;
      return {
        emi: perCycle,
        totalAmount: principal,
        totalInterest: 0,
        remaining: Math.max(0, principal - totalPaid),
      };
    }
    const rate = parseFloat(form.interestRate) || 0;
    if (!isInterestApplicable || rate === 0) {
      const totalAmount = principal;
      const emi = totalAmount / duration;
      const totalPaid = Number(loan.repayment?.totalPaid) || 0;
      return {
        emi,
        totalAmount,
        totalInterest: 0,
        remaining: Math.max(0, totalAmount - totalPaid),
      };
    }
    const totalInterest = (principal * rate * (duration / 12)) / 100;
    const totalAmount = principal + totalInterest;
    const emi = totalAmount / duration;
    const totalPaid = Number(loan.repayment?.totalPaid) || 0;
    return {
      emi,
      totalAmount,
      totalInterest,
      remaining: Math.max(0, totalAmount - totalPaid),
    };
  }, [form.amount, form.duration, form.interestRate, loan, isInterestApplicable]);

  const financialTouched =
    parseFloat(form.amount) !== Number(loan.amount) ||
    parseInt(form.duration, 10) !== Number(loan.duration) ||
    (loan.requestType === 'loan' &&
      parseFloat(form.interestRate) !== Number(loan.loanConfig?.interestRate ?? defaultInterestRate ?? 0)) ||
    (loan.requestType === 'loan' && selectedLoanDeductionMonth !== storedLoanDeductionMonth) ||
    (loan.requestType === 'salary_advance' && selectedAdvanceDeductionMonth !== storedAdvanceDeductionMonth);

  const installmentsRemaining = useMemo(() => {
    const total = parseInt(repaymentForm.totalInstallments, 10) || Number(loan.repayment?.totalInstallments) || Number(loan.duration) || 0;
    const paid = parseInt(repaymentForm.installmentsPaid, 10);
    if (Number.isNaN(paid)) return null;
    return Math.max(0, total - paid);
  }, [repaymentForm.totalInstallments, repaymentForm.installmentsPaid, loan]);

  const handleRepaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repaymentForm.changeReason.trim()) {
      Swal.fire({ icon: 'warning', title: 'Remarks required', text: 'Please enter remarks for this repayment correction.' });
      return;
    }

    try {
      setSaving(true);
      const payload: {
        changeReason: string;
        remarks?: string;
        totalPaid?: number;
        installmentsPaid?: number;
        remainingBalance?: number;
        totalInstallments?: number;
      } = {
        changeReason: repaymentForm.changeReason.trim(),
        remarks: repaymentForm.remarks.trim() || undefined,
      };

      if (repaymentForm.totalPaid !== '') payload.totalPaid = parseFloat(repaymentForm.totalPaid);
      if (repaymentForm.installmentsPaid !== '') payload.installmentsPaid = parseInt(repaymentForm.installmentsPaid, 10);
      if (repaymentForm.remainingBalance !== '') payload.remainingBalance = parseFloat(repaymentForm.remainingBalance);
      if (repaymentForm.totalInstallments !== '') payload.totalInstallments = parseInt(repaymentForm.totalInstallments, 10);

      const response = await api.correctLoanRepayment(loan._id, payload);
      const summary = (response as typeof response & {
        summary?: {
          totalPaid?: number;
          remainingBalance?: number;
          installmentsPaid?: number;
          installmentsRemaining?: number;
        };
      }).summary;
      if (response.success && response.data) {
        Swal.fire({
          icon: 'success',
          title: 'Repayment updated',
          html: summary
            ? `<div class="text-sm text-left">Paid: ₹${Number(summary.totalPaid).toLocaleString()}<br/>Remaining: ₹${Number(summary.remainingBalance).toLocaleString()}<br/>Installments: ${summary.installmentsPaid} paid / ${summary.installmentsRemaining} left</div>`
            : 'Opening balance saved.',
          timer: 3000,
          showConfirmButton: false,
        });
        onSaved(response.data);
        onClose();
      } else {
        Swal.fire({ icon: 'error', title: 'Failed', text: response.error || 'Failed to update repayment' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update repayment';
      Swal.fire({ icon: 'error', title: 'Error', text: message });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (financialTouched && !form.changeReason.trim()) {
      Swal.fire({ icon: 'warning', title: 'Reason required', text: 'Please enter a reason for financial changes.' });
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        reason: form.reason,
        remarks: form.remarks,
        changeReason: form.changeReason.trim() || `Edited by ${user?.name || 'Admin'}`,
        recalculate: form.recalculate,
      };

      if (financialEditable) {
        payload.amount = parseFloat(form.amount);
        payload.duration = parseInt(form.duration, 10);
      }
      if (loan.requestType === 'loan' && financialEditable) {
        payload.interestRate = parseFloat(form.interestRate) || 0;
        if (selectedLoanDeductionMonth && selectedLoanDeductionMonth !== storedLoanDeductionMonth) {
          payload.firstDeductionPayrollMonth = selectedLoanDeductionMonth;
        }
      }
      if (
        loan.requestType === 'salary_advance' &&
        financialEditable &&
        selectedAdvanceDeductionMonth &&
        selectedAdvanceDeductionMonth !== storedAdvanceDeductionMonth
      ) {
        payload.deductionStartCycle = selectedAdvanceDeductionMonth;
      }
      if (isSuperAdmin && form.status && form.status !== loan.status) {
        payload.status = form.status;
        payload.statusChangeReason = `Status changed from ${loan.status} to ${form.status}`;
      }

      const response = await api.updateLoan(loan._id, payload);
      if (response.success && response.data) {
        const wasRecalculated = (response as any)?.recalculated === true;
        Swal.fire({
          icon: 'success',
          title: 'Saved',
          text: wasRecalculated
            ? 'Updated and schedule re-evaluated.'
            : 'Changes saved successfully.',
          timer: 2000,
          showConfirmButton: false,
        });
        onSaved(response.data);
        onClose();
      } else {
        Swal.fire({ icon: 'error', title: 'Failed', text: response.error || 'Failed to update' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      Swal.fire({ icon: 'error', title: 'Error', text: message });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <LoanDetailDialog open={open} onClose={onClose} maxWidth="max-w-lg" layerClass="z-[60]">
      <LoanDetailDialogHeader
        badge="Edit request"
        title={`Edit ${loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'}`}
        subtitle={`Status: ${loan.status.replace(/_/g, ' ')}`}
        onClose={onClose}
      />
      <LoanDetailDialogBody>
        {canRepaymentCorrection && (
          <LoanDialogModeTabs
            value={editMode}
            onChange={(v) => setEditMode(v as 'terms' | 'repayment')}
            options={[
              { value: 'repayment', label: 'Repayment status' },
              { value: 'terms', label: 'Loan terms' },
            ]}
          />
        )}

        {editMode === 'repayment' && canRepaymentCorrection ? (
          <form onSubmit={handleRepaymentSubmit} className="space-y-4">
            <LoanFormInfo title="Opening balance / migration">
              <p className="text-xs leading-relaxed">
                Use this after disbursement to set how much is already paid, remaining balance, and installments
                completed — without changing EMI or loan amount. For new companies entering old loans.
              </p>
            </LoanFormInfo>

            <LoanFormPanel soft className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-stone-500">Total to recover</span>
                <p className="font-bold text-stone-900 dark:text-white">₹{totalRecoverable.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-stone-500">Installments left (calc)</span>
                <p className="font-bold text-stone-900 dark:text-white">
                  {installmentsRemaining != null ? installmentsRemaining : '—'}
                </p>
              </div>
            </LoanFormPanel>

            <div>
              <LoanFormLabel>Total paid so far (₹)</LoanFormLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                max={totalRecoverable}
                value={repaymentForm.totalPaid}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, totalPaid: e.target.value })}
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
                placeholder="Amount already deducted"
              />
            </div>

            <div>
              <LoanFormLabel>Remaining balance (₹)</LoanFormLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                value={repaymentForm.remainingBalance}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, remainingBalance: e.target.value })}
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
                placeholder="Outstanding amount"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <LoanFormLabel>{loan.requestType === 'loan' ? 'EMIs' : 'Cycles'} paid</LoanFormLabel>
                <input
                  type="number"
                  min="0"
                  value={repaymentForm.installmentsPaid}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, installmentsPaid: e.target.value })}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
              <div>
                <LoanFormLabel>Total {loan.requestType === 'loan' ? 'EMIs' : 'cycles'}</LoanFormLabel>
                <input
                  type="number"
                  min="1"
                  value={repaymentForm.totalInstallments}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, totalInstallments: e.target.value })}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
            </div>

            <div>
              <LoanFormLabel>Remarks (optional)</LoanFormLabel>
              <textarea
                value={repaymentForm.remarks}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, remarks: e.target.value })}
                rows={2}
                className={loansFormTextareaClass()}
                style={loansFormInputStyle()}
              />
            </div>

            <div>
              <LoanFormLabel>Reason for correction *</LoanFormLabel>
              <input
                type="text"
                required
                value={repaymentForm.changeReason}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, changeReason: e.target.value })}
                placeholder="e.g. Opening balance from old payroll — 4 EMIs already paid"
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
              />
            </div>

            <LoanDialogFooter
              onCancel={onClose}
              submitLabel="Update repayment status"
              loading={saving}
              submitDisabled={saving}
            />
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {loan.requestType === 'salary_advance' && eligibilityData && (
            <LoanFormInfo title="Eligibility">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-stone-500">Eligible </span>
                  <span className="font-bold" style={{ color: 'var(--ps-accent)' }}>
                    ₹{eligibilityData.eligibleAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500">Max </span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">
                    ₹{eligibilityData.finalMaxAllowed.toLocaleString()}
                  </span>
                </div>
              </div>
            </LoanFormInfo>
          )}

          <div>
            <LoanFormLabel>Amount (₹) {financialEditable ? '*' : ''}</LoanFormLabel>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              disabled={!financialEditable}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required={financialEditable}
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
            />
          </div>

          <div>
            <LoanFormLabel>
              Duration ({loan.requestType === 'loan' ? 'months' : 'cycles'}) {financialEditable ? '*' : ''}
            </LoanFormLabel>
            <input
              type="number"
              min="1"
              value={form.duration}
              disabled={!financialEditable}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              required={financialEditable}
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
            />
          </div>

          {loan.requestType === 'loan' && financialEditable && (
            <div>
              <LoanFormLabel>Interest rate (% p.a.)</LoanFormLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                className={loansFormInputClass()}
                style={loansFormInputStyle()}
              />
            </div>
          )}

          {loan.requestType === 'loan' && financialEditable && (
            <div>
              <LoanFormLabel>First deduction pay period</LoanFormLabel>
              <select
                value={form.firstDeductionPayrollMonth}
                onChange={(e) => setForm({ ...form, firstDeductionPayrollMonth: e.target.value })}
                className={loansFormSelectClass()}
                style={loansFormInputStyle()}
              >
                {periodOpts.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.range ? `${opt.label} (${opt.range.from} → ${opt.range.to})` : opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {loan.requestType === 'salary_advance' && financialEditable && (
            <div>
              <LoanFormLabel>Deduction start cycle</LoanFormLabel>
              <select
                value={form.deductionStartCycle}
                onChange={(e) => setForm({ ...form, deductionStartCycle: e.target.value })}
                className={loansFormSelectClass()}
                style={loansFormInputStyle()}
              >
                {periodOpts.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.range ? `${opt.label} (${opt.range.from} → ${opt.range.to})` : opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <LoanFormLabel>Reason / purpose *</LoanFormLabel>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              rows={2}
              className={loansFormTextareaClass()}
              style={loansFormInputStyle()}
            />
          </div>

          <div>
            <LoanFormLabel>Remarks</LoanFormLabel>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
              className={loansFormTextareaClass()}
              style={loansFormInputStyle()}
            />
          </div>

          <div>
            <LoanFormLabel>Reason for change {financialTouched ? '*' : '(for audit)'}</LoanFormLabel>
            <input
              type="text"
              value={form.changeReason}
              onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
              placeholder="e.g. Corrected tenure per HR approval"
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
            />
          </div>

          {financialEditable && (
            <label
              className="flex cursor-pointer items-start gap-3 border p-3"
              style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(var(--ps-accent-rgb), 0.04)' }}
            >
              <input
                type="checkbox"
                checked={form.recalculate}
                onChange={(e) => setForm({ ...form, recalculate: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-stone-800 dark:text-stone-200">
                <span className="font-semibold">Re-evaluate schedule & balances</span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  Recalculates EMI / per-cycle deduction and remaining balance. Payments already recorded are kept.
                </span>
              </span>
            </label>
          )}

          {preview && (
            <LoanFormPanel soft className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Monthly deduction (est)</span>
                <span className="font-bold" style={{ color: 'var(--ps-accent)' }}>
                  ₹{Math.round(preview.emi).toLocaleString()}
                </span>
              </div>
              {preview.totalInterest > 0 && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Total interest</span>
                  <span>₹{Math.round(preview.totalInterest).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-stone-500">Total to recover</span>
                <span className="font-bold">₹{Math.round(preview.totalAmount).toLocaleString()}</span>
              </div>
              {isActiveLoan && (
                <div className="flex justify-between border-t pt-1" style={{ borderColor: 'var(--ps-accent-border)' }}>
                  <span className="font-medium text-stone-600">Remaining after edit</span>
                  <span className="font-bold text-stone-900 dark:text-white">
                    ₹{Math.round(preview.remaining).toLocaleString()}
                  </span>
                </div>
              )}
            </LoanFormPanel>
          )}

          {isSuperAdmin && (
            <div>
              <LoanFormLabel>Status (super admin)</LoanFormLabel>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={loansFormSelectClass()}
                style={loansFormInputStyle()}
              >
                <option value="pending">Pending</option>
                <option value="hod_approved">HOD Approved</option>
                <option value="hr_approved">HR Approved</option>
                <option value="approved">Approved</option>
                <option value="disbursed">Disbursed</option>
                <option value="active">Active</option>
                <option value="hod_rejected">HOD Rejected</option>
                <option value="hr_rejected">HR Rejected</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          {loan.changeHistory && loan.changeHistory.length > 0 && (
            <LoanFormPanel soft>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">Recent changes</p>
              <ul className="max-h-28 space-y-2 overflow-y-auto">
                {[...loan.changeHistory].reverse().slice(0, 5).map((ch, i) => (
                  <li key={i} className="text-xs text-stone-600 dark:text-stone-400">
                    <span className="font-medium">{ch.field}</span>: {String(ch.originalValue)} → {String(ch.newValue)}
                    {ch.modifiedByName && <span className="text-stone-400"> — {ch.modifiedByName}</span>}
                  </li>
                ))}
              </ul>
            </LoanFormPanel>
          )}

          <LoanDialogFooter
            onCancel={onClose}
            submitLabel="Save changes"
            loading={saving}
            submitDisabled={saving}
          />
        </form>
        )}
      </LoanDetailDialogBody>
    </LoanDetailDialog>
  );
}

export function canShowLoanEditButton(status: string, hasManagePermission: boolean) {
  if (!hasManagePermission) return false;
  return !['completed', 'cancelled', 'rejected'].includes(status);
}
