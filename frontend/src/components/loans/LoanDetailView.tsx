'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import { canManageLoans } from '@/lib/permissions';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  ArrowLeft,
  Printer,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import {
  LoansPageShell,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanDetailField,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import LoanEditDialog, { canShowLoanEditButton } from '@/components/loans/LoanEditDialog';
import LoanGuarantorPicker from '@/components/loans/LoanGuarantorPicker';
import {
  LedgerApprovalPanel,
  LedgerApprovalTimeline,
  LedgerFinalApprovalPayPeriod,
  LedgerLoanRecalculationPreview,
  LedgerTransactionHistory,
  LedgerWaitingBanner,
} from '@/components/ledger';
import { downloadLoanAdvanceRequestPdf, type LoanAdvancePdfLoan } from '@/lib/loanAdvanceRequestPdf';
import {
  buildLoanTimelineSteps,
  canUserActOnLoan,
  isLoanFinalApprovalStep,
} from '@/lib/loanWorkflowUi';
import {
  buildLeaveODPayPeriodOptions,
  getPayPeriodRangeForCalendarMonth,
  payPeriodSelectValueToMonthKey,
  payrollMonthKeyToPayPeriodSelectValue,
} from '@/lib/payPeriodRange';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  hod_approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  disbursed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  active: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  completed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
}

type ExposureRow = {
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

type AttendanceMonth = {
  month: string;
  monthName: string;
  workingDays: number;
  present: number;
  leave: number;
  lop: number;
  attendancePercent: number | null;
};

function formatRs(n?: number | null) {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function monthsBetweenYm(fromYm: string, toYm: string) {
  const a = /^(\d{4})-(\d{2})$/.exec(fromYm);
  const b = /^(\d{4})-(\d{2})$/.exec(toYm);
  if (!a || !b) return 0;
  return (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
}

function calcLoanTotals(principal: number, rate: number, duration: number, preEmiMonths = 0) {
  const p = Number(principal) || 0;
  const d = Math.max(1, Number(duration) || 1);
  const r = Number(rate) || 0;
  const pre = Math.max(0, Number(preEmiMonths) || 0);
  const tenureInterest = r ? Math.round((p * r * (d / 12)) / 100) : 0;
  const preEmiInterest = r && pre > 0 ? Math.round((p * r * (pre / 12)) / 100) : 0;
  const totalInterest = tenureInterest + preEmiInterest;
  const totalAmount = Math.round(p + totalInterest);
  const emi = totalAmount / d;
  return { tenureInterest, preEmiInterest, totalInterest, totalAmount, emi, preEmiMonths: pre };
}

export default function LoanDetailView({ loanId }: { loanId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any>(null);
  const [loanSettings, setLoanSettings] = useState<any>(null);
  const [presentPayPeriod, setPresentPayPeriod] = useState<any>(null);
  const [applicationPdfContext, setApplicationPdfContext] = useState<any>(null);
  const [employeeExposure, setEmployeeExposure] = useState<any>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [workflowMeta, setWorkflowMeta] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedGuarantorIds, setSelectedGuarantorIds] = useState<string[]>([]);
  const [savingGuarantors, setSavingGuarantors] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [attendanceConsentChecked, setAttendanceConsentChecked] = useState(false);
  const [approvalAmount, setApprovalAmount] = useState('');
  const [approvalInterestRate, setApprovalInterestRate] = useState('');
  const [approvalDuration, setApprovalDuration] = useState('');
  const [finalApprovalPayPeriod, setFinalApprovalPayPeriod] = useState('__default__');
  const [interestStartPayPeriod, setInterestStartPayPeriod] = useState('__default__');
  const [payCycleStartDay, setPayCycleStartDay] = useState(1);
  const [payCycleEndDay, setPayCycleEndDay] = useState<number | null>(null);

  const currentUser = auth.getUser();
  const hasManagePermission = currentUser ? canManageLoans(currentUser as Parameters<typeof canManageLoans>[0]) : false;

  const loadLoan = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getLoan(loanId) as any;
      if (!res.success || !res.data) {
        toast.error('Loan not found');
        router.push('/loans');
        return;
      }
      setLoan(res.data);
      setPresentPayPeriod(res.presentPayPeriod);
      setApplicationPdfContext(res.applicationPdfContext);
      setEmployeeExposure(res.employeeExposure || res.applicationPdfContext?.employeeExposure);
      setAttendanceSummary(res.attendanceSummary || res.applicationPdfContext?.attendanceSummary);
      setWorkflowMeta(res.workflowMeta);

      const settingsRes = await api.getLoanSettings(res.data.requestType);
      if (settingsRes.success) setLoanSettings(settingsRes.data);

      const txRes = await api.getLoanTransactions(loanId);
      if (txRes.success) setTransactions(txRes.data || []);

      const existingGuarantors = (res.data.guarantors || []).map((g: any) =>
        String(g.employeeId?._id || g.employeeId)
      );
      setSelectedGuarantorIds(existingGuarantors);
      setApprovalAmount(String(res.data.amount ?? ''));
      setApprovalInterestRate(String(res.data.loanConfig?.interestRate ?? ''));
      setApprovalDuration(String(res.data.duration ?? ''));
      const suggestedCommence = res.data.loanConfig?.emiCommencePayrollMonth;
      const suggestedStart = res.data.loanConfig?.interestStartPayrollMonth;
      setFinalApprovalPayPeriod(
        suggestedCommence
          ? payrollMonthKeyToPayPeriodSelectValue(suggestedCommence)
          : '__default__'
      );
      setInterestStartPayPeriod(
        suggestedStart
          ? payrollMonthKeyToPayPeriodSelectValue(suggestedStart)
          : '__default__'
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to load loan');
    } finally {
      setLoading(false);
    }
  }, [loanId, router]);

  useEffect(() => {
    loadLoan();
  }, [loadLoan]);

  useEffect(() => {
    (async () => {
      try {
        const [startRes, endRes] = await Promise.all([
          api.getSetting('payroll_cycle_start_day'),
          api.getSetting('payroll_cycle_end_day'),
        ]);
        if (startRes?.data?.value != null) setPayCycleStartDay(Number(startRes.data.value) || 1);
        if (endRes?.data?.value != null) {
          const n = Number(endRes.data.value);
          setPayCycleEndDay(Number.isFinite(n) ? n : null);
        }
      } catch {
        /* keep defaults */
      }
    })();
  }, []);

  const isFinalStep = useMemo(
    () => isLoanFinalApprovalStep(loan, loanSettings),
    [loan, loanSettings]
  );
  const canAct = useMemo(
    () => canUserActOnLoan(loan, currentUser, loanSettings),
    [loan, currentUser, loanSettings]
  );
  const timelineSteps = useMemo(
    () => (loan && loanSettings ? buildLoanTimelineSteps(loan, loanSettings) : []),
    [loan, loanSettings]
  );

  const finalApprovalPayPeriodOptions = useMemo(
    () =>
      buildLeaveODPayPeriodOptions({
        payrollCycleStartDay: payCycleStartDay,
        payrollCycleEndDay: payCycleEndDay,
        monthsBack: 3,
        monthsForward: 12,
        getDefaultRange: () => {
          const pk = presentPayPeriod?.payrollMonthKey;
          if (pk) {
            const [y, m] = pk.split('-').map(Number);
            return getPayPeriodRangeForCalendarMonth(y, m, payCycleStartDay, payCycleEndDay);
          }
          const now = new Date();
          return getPayPeriodRangeForCalendarMonth(
            now.getFullYear(),
            now.getMonth() + 1,
            payCycleStartDay,
            payCycleEndDay
          );
        },
        defaultLabel: 'Current pay period',
      }),
    [payCycleStartDay, payCycleEndDay, presentPayPeriod?.payrollMonthKey]
  );

  const selectedFinalPayPeriodPreview = useMemo(() => {
    const opt = finalApprovalPayPeriodOptions.find((o) => o.value === finalApprovalPayPeriod);
    return opt?.range?.to ?? null;
  }, [finalApprovalPayPeriod, finalApprovalPayPeriodOptions]);

  const preEmiEnabled =
    loan?.requestType === 'loan' && loanSettings?.settings?.preEmiInterestEnabled !== false;

  const approvalPreEmiPreview = useMemo(() => {
    if (!preEmiEnabled || !isFinalStep) return null;
    const commence = payPeriodSelectValueToMonthKey(
      finalApprovalPayPeriod,
      presentPayPeriod?.payrollMonthKey
    );
    const start = payPeriodSelectValueToMonthKey(
      interestStartPayPeriod,
      presentPayPeriod?.payrollMonthKey
    );
    if (!commence || !start) return null;
    const preMonths = Math.max(0, monthsBetweenYm(start, commence));
    const principal = parseFloat(approvalAmount) || Number(loan?.amount) || 0;
    const rate = parseFloat(approvalInterestRate) || Number(loan?.loanConfig?.interestRate) || 0;
    const duration = parseInt(approvalDuration, 10) || Number(loan?.duration) || 1;
    const totals = calcLoanTotals(principal, rate, duration, preMonths);
    return { preMonths, ...totals, commence, start };
  }, [
    preEmiEnabled,
    isFinalStep,
    finalApprovalPayPeriod,
    interestStartPayPeriod,
    presentPayPeriod?.payrollMonthKey,
    approvalAmount,
    approvalInterestRate,
    approvalDuration,
    loan,
  ]);

  const showGuarantorPicker =
    ['loan', 'salary_advance'].includes(loan?.requestType) &&
    (workflowMeta?.isGuarantorGateActive || hasManagePermission) &&
    !['completed', 'cancelled', 'rejected', 'disbursed', 'active'].includes(loan?.status);

  const handlePrintApplication = async () => {
    if (!loan) return;
    try {
      const txnRes = await api.getLoanTransactions(loanId);
      const txns = txnRes.success ? txnRes.data?.transactions || [] : [];
      await downloadLoanAdvanceRequestPdf(loan as LoanAdvancePdfLoan, txns, {
        summary: txnRes.data?.summary,
        applicationPdfContext,
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate application PDF');
    }
  };

  const handleAddGuarantors = async () => {
    const min = workflowMeta?.guarantorRules?.minGuarantors ?? 2;
    if (selectedGuarantorIds.length < min) {
      toast.error(`Select at least ${min} eligible guarantors`);
      return;
    }
    try {
      setSavingGuarantors(true);
      const res = await api.addLoanGuarantors(loanId, selectedGuarantorIds);
      if (res.success) {
        toast.success('Guarantors updated');
        await loadLoan();
      } else {
        toast.error(res.error || 'Failed to add guarantors');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add guarantors');
    } finally {
      setSavingGuarantors(false);
    }
  };

  const handleUpdateLoan = async () => {
    try {
      setSavingAction(true);
      const payload: Record<string, number> = {
        amount: parseFloat(approvalAmount),
        duration: parseInt(approvalDuration, 10),
      };
      if (loan?.requestType === 'loan') {
        payload.interestRate = parseFloat(approvalInterestRate);
      }
      const res = await api.updateLoan(loanId, payload);
      if (res.success) {
        toast.success('Loan terms updated');
        await loadLoan();
      } else {
        toast.error(res.error || 'Failed to update loan');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update loan');
    } finally {
      setSavingAction(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (workflowMeta?.currentStage?.verifyAttendance && !attendanceConsentChecked) {
      toast.error('Confirm you have verified applicant attendance before acting on this stage');
      return;
    }
    if (workflowMeta?.guarantorGateBlocked && (action === 'approve' || action === 'reject')) {
      toast.error('Guarantors must accept before this stage can be approved or rejected');
      return;
    }
    if (action === 'approve' && isFinalStep) {
      const monthKey = payPeriodSelectValueToMonthKey(
        finalApprovalPayPeriod,
        presentPayPeriod?.payrollMonthKey
      );
      if (!monthKey) {
        toast.error('Select the EMI commence / first deduction pay period');
        return;
      }
    }

    try {
      setSavingAction(true);
      const payload: any = { action, comments: actionComment || '' };
      if (workflowMeta?.currentStage?.verifyAttendance) {
        payload.attendanceVerified = true;
      }
      if (action === 'approve') {
        if (approvalAmount) payload.approvalAmount = parseFloat(approvalAmount);
        if (approvalInterestRate) payload.approvalInterestRate = parseFloat(approvalInterestRate);
        if (isFinalStep) {
          payload.firstDeductionPayrollMonth = payPeriodSelectValueToMonthKey(
            finalApprovalPayPeriod,
            presentPayPeriod?.payrollMonthKey
          );
          if (preEmiEnabled) {
            payload.interestStartPayrollMonth = payPeriodSelectValueToMonthKey(
              interestStartPayPeriod,
              presentPayPeriod?.payrollMonthKey
            );
          }
        }
      }
      const res = await api.processLoanAction(loanId, payload);
      if (res.success) {
        toast.success(`Request ${action}d`);
        setActionComment('');
        setAttendanceConsentChecked(false);
        await loadLoan();
      } else {
        toast.error(res.error || 'Action failed');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    } finally {
      setSavingAction(false);
    }
  };

  if (loading) {
    return (
      <LoansPageShell>
        <div className="flex min-h-[40vh] items-center justify-center text-slate-500">Loading loan details…</div>
      </LoansPageShell>
    );
  }

  if (!loan) return null;

  const totals = employeeExposure?.totals;

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/loans"
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium ${loansDialogOutlineButtonClass()}`}
            style={loansDialogOutlineButtonStyle()}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to loans
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} — {loan.emp_no}
            </h1>
            <p className="text-sm text-slate-500">
              Form #{loan.applicationFormNumber || '—'} · Applied{' '}
              {new Date(loan.appliedAt).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePrintApplication} className={loansDialogOutlineButtonClass()} style={loansDialogOutlineButtonStyle()}>
            <Printer className="h-4 w-4" />
            Print application
          </button>
          {canShowLoanEditButton(loan.status, hasManagePermission) && (
            <button type="button" onClick={() => setShowEditDialog(true)} className={loansDialogOutlineButtonClass()} style={loansDialogOutlineButtonStyle()}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <LoanDetailSection soft>
            <LoanDetailSectionTitle>Employee details</LoanDetailSectionTitle>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <LoanDetailField label="Name">{loan.employeeId?.employee_name || loan.emp_no}</LoanDetailField>
              <LoanDetailField label="Thumb No">{loan.emp_no}</LoanDetailField>
              <LoanDetailField label="Department">{loan.department?.name || '—'}</LoanDetailField>
              <LoanDetailField label="Designation">{loan.designation?.name || '—'}</LoanDetailField>
              <LoanDetailField label="Amount">{formatRs(loan.amount)}</LoanDetailField>
              <LoanDetailField label="Status">
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium capitalize ${getStatusColor(loan.status)}`}>
                  {loan.status?.replace(/_/g, ' ')}
                </span>
              </LoanDetailField>
              <LoanDetailField label="Reason">{loan.reason || '—'}</LoanDetailField>
            </div>
          </LoanDetailSection>

          {loan.requestType === 'loan' && (
            <LoanDetailSection soft>
              <LoanDetailSectionTitle>Loan terms &amp; EMI schedule</LoanDetailSectionTitle>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <LoanDetailField label="Duration">{loan.duration ? `${loan.duration} months` : '—'}</LoanDetailField>
                <LoanDetailField label="Interest rate">
                  {loan.loanConfig?.interestRate != null ? `${loan.loanConfig.interestRate}%` : '—'}
                </LoanDetailField>
                <LoanDetailField label="EMI">{formatRs(loan.loanConfig?.emiAmount)}</LoanDetailField>
                <LoanDetailField label="Tenure interest">{formatRs(loan.loanConfig?.tenureInterest ?? loan.loanConfig?.totalInterest)}</LoanDetailField>
                <LoanDetailField label="Pre-EMI interest">
                  {formatRs(loan.loanConfig?.preEmiInterest)}
                  {loan.loanConfig?.preEmiMonths > 0 ? ` (${loan.loanConfig.preEmiMonths} mo)` : ''}
                </LoanDetailField>
                <LoanDetailField label="Total repayment">{formatRs(loan.loanConfig?.totalAmount)}</LoanDetailField>
                <LoanDetailField label="Interest start">
                  {loan.loanConfig?.interestStartPayrollMonth || '—'}
                </LoanDetailField>
                <LoanDetailField label="EMI commence">
                  {loan.loanConfig?.emiCommencePayrollMonth ||
                    loan.approvals?.final?.firstDeductionPayrollMonth ||
                    '—'}
                </LoanDetailField>
                <LoanDetailField label="Remaining">{formatRs(loan.repayment?.remainingBalance)}</LoanDetailField>
              </div>
              {loan.loanConfig?.emiCommenceReason && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {loan.loanConfig.emiCommenceReason}
                </p>
              )}
            </LoanDetailSection>
          )}

          {attendanceSummary && (
            <LoanDetailSection soft>
              <LoanDetailSectionTitle>
                Attendance summary (last 6 months)
                {attendanceSummary.overallPercentage != null && (
                  <span className="ml-2 text-sm font-normal text-emerald-600">
                    Overall: {attendanceSummary.overallPercentage}%
                  </span>
                )}
              </LoanDetailSectionTitle>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
                      <th className="px-2 py-2">Month</th>
                      <th className="px-2 py-2">Working days</th>
                      <th className="px-2 py-2">Present</th>
                      <th className="px-2 py-2">Leave</th>
                      <th className="px-2 py-2">LOP</th>
                      <th className="px-2 py-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(attendanceSummary.last6Months as AttendanceMonth[]).map((row) => (
                      <tr key={row.month} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-2 font-medium">{row.monthName || row.month}</td>
                        <td className="px-2 py-2">{row.workingDays || '—'}</td>
                        <td className="px-2 py-2">{row.present ?? '—'}</td>
                        <td className="px-2 py-2">{row.leave ?? '—'}</td>
                        <td className="px-2 py-2">{row.lop ?? '—'}</td>
                        <td className="px-2 py-2">{row.attendancePercent != null ? `${row.attendancePercent}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LoanDetailSection>
          )}

          <LoanDetailSection soft>
            <LoanDetailSectionTitle>Existing loans (as borrower)</LoanDetailSectionTitle>
            {(employeeExposure?.ownLoans as ExposureRow[])?.length ? (
              <ExposureTable rows={employeeExposure.ownLoans} />
            ) : (
              <p className="text-sm text-slate-500">No prior loan records.</p>
            )}
          </LoanDetailSection>

          <LoanDetailSection soft>
            <LoanDetailSectionTitle>Loans as guarantor</LoanDetailSectionTitle>
            {(employeeExposure?.guaranteedLoans as ExposureRow[])?.length ? (
              <ExposureTable rows={employeeExposure.guaranteedLoans} showBorrower />
            ) : (
              <p className="text-sm text-slate-500">Not standing as guarantor on any loan.</p>
            )}
          </LoanDetailSection>

          {totals && (
            <LoanDetailSection highlight>
              <LoanDetailSectionTitle>Total liability summary</LoanDetailSectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <LoanDetailField label="Own outstanding">{formatRs(totals.ownOutstanding)}</LoanDetailField>
                <LoanDetailField label="Guaranteed outstanding">{formatRs(totals.guaranteedOutstanding)}</LoanDetailField>
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

          {['loan', 'salary_advance'].includes(loan.requestType) && (
            <LoanDetailSection soft>
              <LoanDetailSectionTitle>
                <ShieldCheck className="mr-1 inline h-4 w-4" />
                Guarantors
                {workflowMeta?.guarantorStatus && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {workflowMeta.guarantorStatus.acceptedCount}/{workflowMeta.guarantorStatus.minRequired} accepted
                  </span>
                )}
              </LoanDetailSectionTitle>

              {loan.guarantors?.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {loan.guarantors.map((g: any, i: number) => (
                    <li key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <span>{g.name} ({g.emp_no})</span>
                      <span className={`rounded px-2 py-0.5 text-xs capitalize ${g.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : g.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {g.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {showGuarantorPicker && (
                <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <LoanGuarantorPicker
                    loanId={loanId}
                    selectedIds={selectedGuarantorIds}
                    onChange={setSelectedGuarantorIds}
                    knownPeople={(loan.guarantors || []).map((g: any) => ({
                      employeeId: g.employeeId,
                      emp_no: g.emp_no,
                      name: g.name,
                    }))}
                    minGuarantors={workflowMeta?.guarantorRules?.minGuarantors ?? 2}
                    maxGuarantors={workflowMeta?.guarantorRules?.maxGuarantors ?? 4}
                    disabled={savingGuarantors}
                    helperText={
                      workflowMeta?.isGuarantorGateActive
                        ? 'Guarantors are required at this stage. Search by name or emp no, select eligible employees, then save.'
                        : 'Assign or update guarantors for this loan. Only eligible employees can be selected.'
                    }
                  />
                  <button
                    type="button"
                    disabled={savingGuarantors}
                    onClick={handleAddGuarantors}
                    className={loansPrimaryButtonClass()}
                    style={loansPrimaryButtonStyle()}
                  >
                    {savingGuarantors ? 'Saving…' : 'Save guarantors'}
                  </button>
                </div>
              )}
            </LoanDetailSection>
          )}

          <LedgerTransactionHistory transactions={transactions} onRefresh={() => api.getLoanTransactions(loanId).then((r) => r.success && setTransactions(r.data || []))} />
        </div>

        <div className="space-y-6">
          {timelineSteps.length > 0 && <LedgerApprovalTimeline steps={timelineSteps} />}
          {canAct && !['approved', 'rejected', 'cancelled', 'disbursed', 'active', 'completed'].includes(loan.status) && (
            <>
              {workflowMeta?.guarantorGateBlocked && (
                <LedgerWaitingBanner>
                  Guarantors required: {workflowMeta.guarantorStatus?.acceptedCount}/{workflowMeta.guarantorStatus?.minRequired} accepted before approval can proceed.
                </LedgerWaitingBanner>
              )}
              {!workflowMeta?.guarantorGateBlocked && (
                <LedgerApprovalPanel
                  showAmount={
                    loan.requestType === 'salary_advance' ||
                    (loan.requestType === 'loan' &&
                      ['super_admin', 'hr', 'sub_admin'].includes(currentUser?.role || ''))
                  }
                  amount={approvalAmount}
                  onAmountChange={setApprovalAmount}
                  showLoanTerms={
                    loan.requestType === 'loan' &&
                    ['super_admin', 'hr', 'sub_admin'].includes(currentUser?.role || '')
                  }
                  interestRate={approvalInterestRate}
                  onInterestRateChange={setApprovalInterestRate}
                  duration={approvalDuration}
                  onDurationChange={setApprovalDuration}
                  recalculationPreview={
                    loan.requestType === 'loan' && approvalAmount ? (
                      <LedgerLoanRecalculationPreview
                        emi={
                          approvalPreEmiPreview?.emi ??
                          calcLoanTotals(
                            parseFloat(approvalAmount),
                            parseFloat(approvalInterestRate) || 0,
                            parseInt(approvalDuration, 10) || loan.duration || 1
                          ).emi
                        }
                        totalInterest={
                          approvalPreEmiPreview?.totalInterest ??
                          calcLoanTotals(
                            parseFloat(approvalAmount),
                            parseFloat(approvalInterestRate) || 0,
                            parseInt(approvalDuration, 10) || loan.duration || 1
                          ).totalInterest
                        }
                        totalRepayment={
                          approvalPreEmiPreview?.totalAmount ??
                          calcLoanTotals(
                            parseFloat(approvalAmount),
                            parseFloat(approvalInterestRate) || 0,
                            parseInt(approvalDuration, 10) || loan.duration || 1
                          ).totalAmount
                        }
                      />
                    ) : undefined
                  }
                  showUpdateWarning={
                    approvalAmount !== String(loan.amount ?? '') ||
                    approvalInterestRate !== String(loan.loanConfig?.interestRate ?? '') ||
                    approvalDuration !== String(loan.duration ?? '')
                  }
                  onUpdateLoan={handleUpdateLoan}
                  updating={savingAction}
                  finalApprovalBlock={
                    isFinalStep ? (
                      <LedgerFinalApprovalPayPeriod
                        value={finalApprovalPayPeriod}
                        onChange={setFinalApprovalPayPeriod}
                        options={finalApprovalPayPeriodOptions}
                        previewLabel={selectedFinalPayPeriodPreview ?? undefined}
                        showInterestStart={preEmiEnabled}
                        interestStartValue={interestStartPayPeriod}
                        onInterestStartChange={setInterestStartPayPeriod}
                        preEmiPreview={
                          approvalPreEmiPreview && approvalPreEmiPreview.preMonths > 0 ? (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                              Pre-EMI window: {approvalPreEmiPreview.preMonths} month(s) (
                              {approvalPreEmiPreview.start} → {approvalPreEmiPreview.commence}). Extra interest{' '}
                              {formatRs(approvalPreEmiPreview.preEmiInterest)}; revised EMI{' '}
                              {formatRs(Math.round(approvalPreEmiPreview.emi))}.
                            </p>
                          ) : undefined
                        }
                      />
                    ) : undefined
                  }
                  requireAttendanceConsent={!!workflowMeta?.currentStage?.verifyAttendance}
                  attendanceConsentChecked={attendanceConsentChecked}
                  onAttendanceConsentChange={setAttendanceConsentChecked}
                  actionsDisabled={!!workflowMeta?.guarantorGateBlocked}
                  actionsDisabledReason={
                    workflowMeta?.guarantorGateBlocked
                      ? `Guarantors required: ${workflowMeta?.guarantorStatus?.acceptedCount ?? 0}/${workflowMeta?.guarantorStatus?.minRequired ?? 2} accepted.`
                      : undefined
                  }
                  comment={actionComment}
                  onCommentChange={setActionComment}
                  onApprove={() => handleAction('approve')}
                  onReject={() => handleAction('reject')}
                  saving={savingAction}
                />
              )}
            </>
          )}
        </div>
      </div>

      {showEditDialog && (
        <LoanEditDialog
          loan={loan}
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onSaved={(updated) => {
            setLoan(updated);
            setShowEditDialog(false);
            loadLoan();
          }}
        />
      )}
    </LoansPageShell>
  );
}

function ExposureTable({ rows, showBorrower }: { rows: ExposureRow[]; showBorrower?: boolean }) {
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
                <td className="px-2 py-2">{row.borrowerName} ({row.borrowerEmpNo})</td>
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
