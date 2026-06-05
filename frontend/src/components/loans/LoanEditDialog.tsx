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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">
          Edit {loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 capitalize">
          Status: {loan.status.replace(/_/g, ' ')}
        </p>

        {canRepaymentCorrection && (
          <div className="flex gap-1 p-1 mb-4 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setEditMode('repayment')}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                editMode === 'repayment'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Repayment status
            </button>
            <button
              type="button"
              onClick={() => setEditMode('terms')}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                editMode === 'terms'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Loan terms
            </button>
          </div>
        )}

        {editMode === 'repayment' && canRepaymentCorrection ? (
          <form onSubmit={handleRepaymentSubmit} className="space-y-4">
            <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/80 dark:border-indigo-800/50 dark:bg-indigo-900/10 text-xs text-indigo-900 dark:text-indigo-100">
              <p className="font-semibold mb-1">Opening balance / migration</p>
              <p>
                Use this after disbursement to set how much is already paid, remaining balance, and installments
                completed — without changing EMI or loan amount. For new companies entering old loans.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-500">Total to recover</span>
                <p className="font-bold text-slate-900 dark:text-white">₹{totalRecoverable.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-slate-500">Installments left (calc)</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {installmentsRemaining != null ? installmentsRemaining : '—'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Total paid so far (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={totalRecoverable}
                value={repaymentForm.totalPaid}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, totalPaid: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Amount already deducted"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Remaining balance (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={repaymentForm.remainingBalance}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, remainingBalance: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Outstanding amount"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {loan.requestType === 'loan' ? 'EMIs' : 'Cycles'} paid
                </label>
                <input
                  type="number"
                  min="0"
                  value={repaymentForm.installmentsPaid}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, installmentsPaid: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Total {loan.requestType === 'loan' ? 'EMIs' : 'cycles'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={repaymentForm.totalInstallments}
                  onChange={(e) => setRepaymentForm({ ...repaymentForm, totalInstallments: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks (optional)</label>
              <textarea
                value={repaymentForm.remarks}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, remarks: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reason for correction *
              </label>
              <input
                type="text"
                required
                value={repaymentForm.changeReason}
                onChange={(e) => setRepaymentForm({ ...repaymentForm, changeReason: e.target.value })}
                placeholder="e.g. Opening balance from old payroll — 4 EMIs already paid"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Update repayment status'}
              </button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {loan.requestType === 'salary_advance' && eligibilityData && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
              <h5 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">Eligibility</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Eligible </span>
                  <span className="font-bold text-green-600">₹{eligibilityData.eligibleAmount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Max </span>
                  <span className="font-bold text-purple-600">₹{eligibilityData.finalMaxAllowed.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Amount (₹) {financialEditable ? '*' : ''}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              disabled={!financialEditable}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required={financialEditable}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Duration ({loan.requestType === 'loan' ? 'months' : 'cycles'}) {financialEditable ? '*' : ''}
            </label>
            <input
              type="number"
              min="1"
              value={form.duration}
              disabled={!financialEditable}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              required={financialEditable}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-60"
            />
          </div>

          {loan.requestType === 'loan' && financialEditable && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Interest rate (% p.a.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}

          {loan.requestType === 'loan' && financialEditable && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                First deduction pay period
              </label>
              <select
                value={form.firstDeductionPayrollMonth}
                onChange={(e) => setForm({ ...form, firstDeductionPayrollMonth: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Deduction start cycle
              </label>
              <select
                value={form.deductionStartCycle}
                onChange={(e) => setForm({ ...form, deductionStartCycle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reason / purpose *</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks</label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Reason for change {financialTouched ? '*' : '(for audit)'}
            </label>
            <input
              type="text"
              value={form.changeReason}
              onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
              placeholder="e.g. Corrected tenure per HR approval"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {financialEditable && (
            <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-900/10 cursor-pointer">
              <input
                type="checkbox"
                checked={form.recalculate}
                onChange={(e) => setForm({ ...form, recalculate: e.target.checked })}
                className="mt-1"
              />
              <span className="text-sm text-amber-900 dark:text-amber-100">
                <span className="font-semibold">Re-evaluate schedule & balances</span>
                <span className="block text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Recalculates EMI / per-cycle deduction and remaining balance. Payments already recorded are kept.
                </span>
              </span>
            </label>
          )}

          {preview && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly deduction (est)</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">₹{Math.round(preview.emi).toLocaleString()}</span>
              </div>
              {preview.totalInterest > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Total interest</span>
                  <span>₹{Math.round(preview.totalInterest).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Total to recover</span>
                <span className="font-bold">₹{Math.round(preview.totalAmount).toLocaleString()}</span>
              </div>
              {isActiveLoan && (
                <div className="flex justify-between pt-1 border-t border-blue-100 dark:border-blue-800/50">
                  <span className="text-slate-600 font-medium">Remaining after edit</span>
                  <span className="font-bold text-slate-900 dark:text-white">₹{Math.round(preview.remaining).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status (super admin)</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Recent changes</p>
              <ul className="space-y-2 max-h-28 overflow-y-auto">
                {[...loan.changeHistory].reverse().slice(0, 5).map((ch, i) => (
                  <li key={i} className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-medium">{ch.field}</span>: {String(ch.originalValue)} → {String(ch.newValue)}
                    {ch.modifiedByName && <span className="text-slate-400"> — {ch.modifiedByName}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

export function canShowLoanEditButton(status: string, hasManagePermission: boolean) {
  if (!hasManagePermission) return false;
  return !['completed', 'cancelled', 'rejected'].includes(status);
}
