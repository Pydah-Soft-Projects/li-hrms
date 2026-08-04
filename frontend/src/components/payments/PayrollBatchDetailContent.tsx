"use client";

import { useState, useEffect } from "react";
import { Save, FileDown, Lock, Unlock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import { alertConfirm, alertError, ledgerSwalFire } from "@/lib/customSwal";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  Snowflake,
  CheckCheck,
  History,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { api, PayrollBatch, PayrollBatchStatus } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { resolveEmployeeListDisplayParts } from "@/lib/employeeListDisplay";
import {
  DEFAULT_QUALIFICATION_STATUS_OPTIONS,
  overallQualificationStatusLabel,
  qualificationStatusBadgeClass,
} from "@/lib/qualificationStatus";
import { MissingPayrollEmployeesAlert } from "@/components/payments/MissingPayrollEmployeesAlert";
import MissingPayrollWarningDialog from "@/components/payments/MissingPayrollWarningDialog";
import SalaryPendingWarningDialog from "@/components/payments/SalaryPendingWarningDialog";
import {
  collectApproveValidationIssues,
  collectSalaryPendingValidationIssues,
  isMissingPayrollError,
  isSalaryPendingError,
  payRegisterPathFromIssues,
  type BatchPayrollValidationIssue,
  type SalaryPendingValidationIssue,
} from "@/lib/payrollBatchValidation";
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansTabBar,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from "@/components/loans/LoansPageShell";
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDialogFooter,
  LoanFormLabel,
  LoanFormInfo,
  LoanFormError,
  LoanDetailSection,
  LoanDetailSectionTitle,
  loansFormTextareaClass,
  loansFormInputStyle,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from "@/components/loans/LoanDetailDialogShell";
import { ledgerMoneyClass, ledgerStatusBadgeClass, type LedgerUiStatus } from "@/lib/ledgerUi";

const statusLabels: Record<PayrollBatchStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  freeze: "Frozen",
  complete: "Completed",
};

function batchLedgerStatus(status: PayrollBatchStatus): LedgerUiStatus {
  if (status === "complete" || status === "approved") return "approved";
  if (status === "freeze") return "neutral";
  return "pending";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const actionLabels: Record<string, string> = {
  approve: "Approved",
  freeze: "Frozen",
  complete: "Completed",
  unfreeze: "Unfrozen",
};

const actionDialogTitle: Record<string, string> = {
  approve: "Approve Payroll Batch",
  freeze: "Freeze Payroll Batch",
  complete: "Mark Batch as Complete",
  unfreeze: "Unfreeze Batch (Revert to Approved)",
};

function PayrollBatchEmployeeCell({
  source,
  batchComplete = false,
}: {
  source: {
    employee_name?: string;
    emp_no?: string;
    designation?: string;
    department?: string;
    division?: string;
    qualificationStatus?: string;
    salaryStatus?: string;
    salaryOnHold?: boolean;
    salaryHoldReason?: string | null;
    continuousAbsent?: { active?: boolean; fromDate?: string; toDate?: string; days?: number } | null;
    employeeId?: any;
  };
  batchComplete?: boolean;
}) {
  const d = resolveEmployeeListDisplayParts(
    {
      employeeId: source.employeeId,
      employee_name: source.employee_name,
      emp_no: source.emp_no,
      designation: source.designation,
      department: source.department,
      division_id: source.division,
    },
    undefined,
  );
  const certStatus =
    source.qualificationStatus ??
    (source.employeeId && typeof source.employeeId === "object" ? source.employeeId.qualificationStatus : undefined);
  const certLabel = overallQualificationStatusLabel(certStatus, DEFAULT_QUALIFICATION_STATUS_OPTIONS);
  const showCert = Boolean(certStatus && String(certStatus).trim());
  const salaryPending =
    source.salaryStatus === "pending_approval" ||
    (source.employeeId && typeof source.employeeId === "object" && source.employeeId.salaryStatus === "pending_approval");
  const salaryOnHold =
    source.salaryOnHold === true ||
    (source.employeeId && typeof source.employeeId === "object" && source.employeeId.salaryOnHold === true);
  const holdReason = source.salaryHoldReason || (source.employeeId && typeof source.employeeId === "object" ? source.employeeId.salaryHoldReason : undefined);
  const continuousAbsent =
    !batchComplete &&
    (source.continuousAbsent?.active
      ? source.continuousAbsent
      : source.employeeId && typeof source.employeeId === "object" && source.employeeId.continuousAbsent?.active
        ? source.employeeId.continuousAbsent
        : null);
  const initial = (d.name.charAt(0) || "E").toUpperCase();

  return (
    <div className="flex min-w-0 items-start gap-2" title={[d.tooltip, showCert ? `Cert: ${certLabel}` : "", continuousAbsent ? `Continuous absent ${continuousAbsent.fromDate} → ${continuousAbsent.toDate}` : "", salaryOnHold ? `Salary hold: ${holdReason || ""}` : ""].filter(Boolean).join(" | ")}>
      {d.profilePhoto ? (
        <img src={d.profilePhoto} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-[10px] font-semibold text-white">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold text-slate-900 dark:text-white">{d.name}</div>
        {d.empDesigLine ? <div className="mt-0.5 truncate text-[9px] text-slate-600 dark:text-slate-400">{d.empDesigLine}</div> : null}
        {(d.deptDivLine || showCert || salaryPending || salaryOnHold || continuousAbsent) ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1 truncate text-[9px] text-slate-500 dark:text-slate-400">
            {d.deptDivLine ? <span className="truncate">{d.deptDivLine}</span> : null}
            {showCert ? (
              <>
                {d.deptDivLine ? <span>•</span> : null}
                <span className={`inline-flex max-w-full truncate rounded px-1 py-0 text-[8px] font-semibold uppercase tracking-wide ${qualificationStatusBadgeClass(certStatus)}`}>
                  {certLabel}
                </span>
              </>
            ) : null}
            {salaryPending ? (
              <>
                {(d.deptDivLine || showCert) ? <span>•</span> : null}
                <span className="inline-flex max-w-full truncate rounded bg-indigo-500/15 px-1 py-0 text-[8px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                  Salary Pending
                </span>
              </>
            ) : null}
            {salaryOnHold ? (
              <>
                {(d.deptDivLine || showCert || salaryPending) ? <span>•</span> : null}
                <span className="inline-flex max-w-full truncate rounded bg-amber-500/15 px-1 py-0 text-[8px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300" title={holdReason || "Salary on hold"}>
                  Salary Hold
                </span>
              </>
            ) : null}
            {continuousAbsent ? (
              <>
                {(d.deptDivLine || showCert || salaryPending || salaryOnHold) ? <span>•</span> : null}
                <span className="inline-flex max-w-full truncate rounded bg-rose-500/15 px-1 py-0 text-[8px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300" title={`Continuous absent ${continuousAbsent.fromDate} → ${continuousAbsent.toDate} (${continuousAbsent.days} days). Verify before completing this batch.`}>
                  3d Absent {continuousAbsent.fromDate}→{continuousAbsent.toDate}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type PayrollBatchDetailContentProps = {
  payRegisterBasePath: string;
  paymentsListPath: string;
};

export function PayrollBatchDetailContent({
  payRegisterBasePath,
  paymentsListPath,
}: PayrollBatchDetailContentProps) {
  const params = useParams();
  const router = useRouter();
  const [batchId, setBatchId] = useState<string>(params.id as string);
  const [batch, setBatch] = useState<PayrollBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "employees" | "history">("overview");

  const [openDialog, setOpenDialog] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "freeze" | "complete" | "unfreeze" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [permissionActionLoading, setPermissionActionLoading] = useState(false);
  const [missingPayrollWarningOpen, setMissingPayrollWarningOpen] = useState(false);
  const [missingPayrollIssues, setMissingPayrollIssues] = useState<BatchPayrollValidationIssue[]>([]);
  const [salaryPendingWarningOpen, setSalaryPendingWarningOpen] = useState(false);
  const [salaryPendingIssues, setSalaryPendingIssues] = useState<SalaryPendingValidationIssue[]>([]);
  const [proceedAnywayLoading, setProceedAnywayLoading] = useState(false);
  const [selectedPayrollRecordIds, setSelectedPayrollRecordIds] = useState<string[]>([]);
  const [holdReason, setHoldReason] = useState("");
  const [holdActionLoading, setHoldActionLoading] = useState(false);
  const [holdHistory, setHoldHistory] = useState<any[]>([]);
  const [holdHistoryLoading, setHoldHistoryLoading] = useState(false);

  useEffect(() => {
    if (batchId) {
      fetchBatchDetails();
    }
  }, [batchId]);

  useEffect(() => {
    if (activeTab === "employees") {
      loadHoldHistory();
    }
  }, [activeTab, batchId]);

  const fetchBatchDetails = async () => {
    try {
      setLoading(true);
      const response = await api.getPayrollBatch(batchId);
      if (response.success && response.data) {
        setBatch(response.data);
      } else {
        toast.error("Failed to load batch details");
      }
    } catch (error) {
      console.error("Error fetching batch details:", error);
      toast.error("Error loading batch details");
    } finally {
      setLoading(false);
    }
  };

  const loadHoldHistory = async () => {
    if (!batchId) return;
    try {
      setHoldHistoryLoading(true);
      const response = await api.getBatchSalaryHoldHistory(batchId);
      if (response?.success) {
        setHoldHistory(response.data || []);
      }
    } catch (error) {
      console.error("Error loading salary hold history:", error);
    } finally {
      setHoldHistoryLoading(false);
    }
  };

  const handleTogglePayrollSelection = (payrollRecordId: string) => {
    setSelectedPayrollRecordIds((prev) =>
      prev.includes(payrollRecordId) ? prev.filter((id) => id !== payrollRecordId) : [...prev, payrollRecordId]
    );
  };

  const handleApplyHold = async (reasonOverride?: string) => {
    const reason = (reasonOverride ?? holdReason).trim();
    if (!batchId || !selectedPayrollRecordIds.length || !reason) {
      toast.error("Select employees and provide a reason to hold salary.");
      return;
    }
    try {
      setHoldActionLoading(true);
      const response = await api.holdBatchSalary(batchId, {
        payrollRecordIds: selectedPayrollRecordIds,
        reason,
      });
      if (response?.success) {
        toast.success("Salary hold applied to selected employees");
        setHoldReason("");
        setSelectedPayrollRecordIds([]);
        await fetchBatchDetails();
        await loadHoldHistory();
      } else {
        toast.error(response?.message || "Failed to apply hold");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to apply hold");
    } finally {
      setHoldActionLoading(false);
    }
  };

  const handleReleaseHold = async () => {
    if (!batchId || !selectedPayrollRecordIds.length) {
      toast.error("Select employees to release the hold.");
      return;
    }
    try {
      setHoldActionLoading(true);
      const response = await api.releaseBatchSalary(batchId, { payrollRecordIds: selectedPayrollRecordIds });
      if (response?.success) {
        toast.success("Salary hold released for selected employees");
        setHoldReason("");
        setSelectedPayrollRecordIds([]);
        await fetchBatchDetails();
        await loadHoldHistory();
      } else {
        toast.error(response?.message || "Failed to release hold");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to release hold");
    } finally {
      setHoldActionLoading(false);
    }
  };

  const handleExportHeldSalaryPdf = async () => {
    if (!batchId) return;
    try {
      const blob = await api.exportBatchHeldSalaryPdf(batchId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary-hold-list-${batch?.batchNumber || batchId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success("Held salary report exported");
    } catch (error: any) {
      toast.error(error?.message || "Failed to export report");
    }
  };

  const handleStatusAction = (action: "approve" | "freeze" | "complete" | "unfreeze") => {
    setActionType(action);
    setOpenDialog(true);
    setActionReason("");
  };

  const showMissingPayrollWarning = (issues: BatchPayrollValidationIssue[]) => {
    if (!issues.length) return false;
    setMissingPayrollIssues(issues);
    setMissingPayrollWarningOpen(true);
    setOpenDialog(false);
    return true;
  };

  const showSalaryPendingWarning = (issues: SalaryPendingValidationIssue[]) => {
    if (!issues.length) return false;
    setSalaryPendingIssues(issues);
    setSalaryPendingWarningOpen(true);
    setOpenDialog(false);
    return true;
  };

  const handleProceedAnywayApprove = async () => {
    if (!batch || !missingPayrollIssues.length) return;
    try {
      setProceedAnywayLoading(true);
      const response = await api.approveBatch(batch._id, actionReason, { proceedAnyway: true });
      if (response?.success) {
        toast.success(response.message || "Batch approved (excluded employees without payroll)");
        setMissingPayrollWarningOpen(false);
        setOpenDialog(false);
        fetchBatchDetails();
      } else {
        toast.error(response?.message || "Approval failed");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Approval failed");
    } finally {
      setProceedAnywayLoading(false);
    }
  };

  const handleActionConfirm = async () => {
    if (!batch || !actionType) return;

    try {
      setActionLoading(true);

      if (actionType === "approve" || actionType === "unfreeze") {
        const salaryPrecheck = await collectSalaryPendingValidationIssues([batch]);
        if (salaryPrecheck.length && showSalaryPendingWarning(salaryPrecheck)) {
          return;
        }
        const precheck = await collectApproveValidationIssues([batch]);
        if (precheck.length && showMissingPayrollWarning(precheck)) {
          return;
        }
      }

      let response;

      switch (actionType) {
        case "approve":
        case "unfreeze":
          response = await api.approveBatch(batch._id, actionReason);
          break;
        case "freeze":
          response = await api.freezeBatch(batch._id, actionReason);
          break;
        case "complete":
          response = await api.completeBatch(batch._id, actionReason);
          break;
      }

      if (response && response.success) {
        toast.success(`Batch ${actionLabels[actionType]} successfully`);
        setOpenDialog(false);
        fetchBatchDetails();
      } else if (
        (actionType === "approve" || actionType === "unfreeze") &&
        ((response as any)?.salaryPendingEmployees?.length || isSalaryPendingError(response?.message, (response as any)?.code))
      ) {
        const pending = (response as any).salaryPendingEmployees || [];
        showSalaryPendingWarning([
          {
            batchId: String(batch._id),
            batchLabel: batch.department?.name || batch.batchNumber,
            month: batch.month,
            salaryPendingEmployees: pending,
          },
        ]);
      } else if (
        (actionType === "approve" || actionType === "unfreeze") &&
        ((response as any)?.missingEmployees?.length || isMissingPayrollError(response?.message))
      ) {
        const missing = (response as any).missingEmployees || [];
        showMissingPayrollWarning([
          {
            batchId: String(batch._id),
            batchLabel: batch.department?.name || batch.batchNumber,
            month: batch.month,
            departmentId: batch.department?._id,
            divisionId:
              typeof batch.division === "object" ? batch.division?._id : batch.division,
            missingEmployees: missing,
          },
        ]);
      } else {
        toast.error(response?.message || "Action failed");
      }
    } catch (error: any) {
      console.error("Action error:", error);
      toast.error(error.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleGrantPermission = async () => {
    if (!batch) return;
    try {
      setPermissionActionLoading(true);
      const response = await api.grantRecalculation(batch._id);
      if (response.success) {
        toast.success("Recalculation permission granted");
        fetchBatchDetails();
      } else {
        toast.error(response.message || "Failed to grant permission");
      }
    } catch (error: any) {
      console.error("Error granting permission:", error);
      toast.error(error.message || "Failed to grant permission");
    } finally {
      setPermissionActionLoading(false);
    }
  };

  if (loading) {
    return (
      <LoansPageShell>
        <div className="flex items-center justify-center gap-3 py-24 text-stone-500">
          <Spinner />
          Loading batch details…
        </div>
      </LoansPageShell>
    );
  }

  if (!batch) {
    return (
      <LoansPageShell>
        <ToastContainer position="top-right" autoClose={3000} />
        <LoanFormError>Batch not found or failed to load.</LoanFormError>
        <button
          type="button"
          onClick={() => router.push(paymentsListPath)}
          className={`mt-4 inline-flex items-center gap-2 ${loansDialogOutlineButtonClass()}`}
          style={loansDialogOutlineButtonStyle()}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to payments
        </button>
      </LoansPageShell>
    );
  }

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {batch.status === "pending" && (
        <button
          type="button"
          onClick={() => handleStatusAction("approve")}
          className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
          style={loansPrimaryButtonStyle()}
        >
          <CheckCircle className="h-4 w-4" />
          Approve
        </button>
      )}
      {batch.status === "approved" && (
        <button
          type="button"
          onClick={() => handleStatusAction("freeze")}
          className={`inline-flex items-center gap-2 ${loansDialogOutlineButtonClass()}`}
          style={loansDialogOutlineButtonStyle()}
        >
          <Snowflake className="h-4 w-4" />
          Freeze
        </button>
      )}
      {batch.status === "freeze" && (
        <>
          <button
            type="button"
            onClick={() => handleStatusAction("unfreeze")}
            className={`inline-flex items-center gap-2 ${loansDialogOutlineButtonClass()}`}
            style={loansDialogOutlineButtonStyle()}
          >
            <History className="h-4 w-4" />
            Unfreeze
          </button>
          <button
            type="button"
            onClick={() => handleStatusAction("complete")}
            className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <CheckCheck className="h-4 w-4" />
            Mark complete
          </button>
        </>
      )}
      <button
        type="button"
        onClick={fetchBatchDetails}
        className={`inline-flex items-center gap-2 ${loansDialogOutlineButtonClass()}`}
        style={loansDialogOutlineButtonStyle()}
      >
        <RefreshCw className="h-4 w-4" />
        Refresh
      </button>
    </div>
  );

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mb-4">
        <button
          type="button"
          onClick={() => router.push(paymentsListPath)}
          className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${loansDialogOutlineButtonClass()}`}
          style={loansDialogOutlineButtonStyle()}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to payments
        </button>
      </div>

      <LoansPageHeader
        badge="Finance · Payroll"
        title={batch.batchNumber}
        subtitle={`${batch.department?.name || "—"} · ${batch.monthName || batch.month}`}
        action={headerActions}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className={ledgerStatusBadgeClass(batchLedgerStatus(batch.status))}>
          {statusLabels[batch.status] || batch.status}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {batch.totalEmployees} employee(s)
        </span>
      </div>

      {batch.recalculationPermission?.requestedBy && !batch.recalculationPermission?.granted && (
        <div className="mb-5">
          <LoanFormInfo title="Recalculation requested">
            <p className="text-sm">
              <strong>Reason:</strong> {batch.recalculationPermission.reason}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Requested on {new Date(batch.recalculationPermission.requestedAt!).toLocaleString()}
            </p>
            <button
              type="button"
              onClick={handleGrantPermission}
              disabled={permissionActionLoading}
              className={`mt-3 inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              {permissionActionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {permissionActionLoading ? "Granting…" : "Grant permission"}
            </button>
          </LoanFormInfo>
        </div>
      )}

      <LoansStatGrid
        stats={[
          { label: "Total gross", value: formatCurrency(batch.totalGrossSalary), accent: true },
          { label: "Deductions", value: formatCurrency(batch.totalDeductions), muted: true },
          { label: "Arrears", value: formatCurrency(batch.totalArrears) },
          { label: "Net pay", value: formatCurrency(batch.totalNetSalary), highlight: true },
        ]}
      />

      <LoansTabBar
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "employees", label: "Employees", count: batch.totalEmployees },
          { id: "history", label: "History" },
        ]}
      />

      {activeTab === "employees" && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Salary hold controls</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Select one or more employees below, then use the buttons to hold or release salary for this batch.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedPayrollRecordIds.length) {
                    toast.error("Select employees first.");
                    return;
                  }
                  const result = await ledgerSwalFire({
                    title: "Hold salary",
                    text: "Enter the reason for holding salary for the selected employees",
                    input: "textarea",
                    inputLabel: "Reason",
                    inputPlaceholder: "Enter the reason here...",
                    showCancelButton: true,
                    confirmButtonText: "Hold",
                    confirmVariant: "primary",
                    size: "md",
                    inputValidator: (value) => {
                      if (!value || !value.trim()) {
                        return "Please enter a reason.";
                      }
                      return undefined;
                    },
                  });
                  if (!result.isConfirmed) return;
                  const reason = result.value?.toString().trim();
                  if (!reason) {
                    void alertError("Reason required", "Please enter a reason to hold salary.");
                    return;
                  }
                  setHoldReason(reason);
                  void handleApplyHold(reason);
                }}
                disabled={holdActionLoading || !selectedPayrollRecordIds.length}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock className="h-4 w-4" />
                {holdActionLoading ? "Working…" : "Hold selected"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedPayrollRecordIds.length) {
                    toast.error("Select employees first.");
                    return;
                  }
                  const result = await alertConfirm(
                    "Release salary hold",
                    "Release salary hold for the selected employees?",
                    "Release"
                  );
                  if (result.isConfirmed) {
                    void handleReleaseHold();
                  }
                }}
                disabled={holdActionLoading || !selectedPayrollRecordIds.length}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Unlock className="h-4 w-4" />
                {holdActionLoading ? "Working…" : "Release selected"}
              </button>
              <button
                type="button"
                onClick={handleExportHeldSalaryPdf}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <FileDown className="h-4 w-4" />
                Export held list
              </button>
            </div>
          </div>
        </div>
      )}

      <LoansContentPanel>
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {batch.validationStatus?.approvedWithExclusions &&
                (batch.validationStatus.excludedEmployeeDetails?.length ?? 0) > 0 && (
                  <LoanFormInfo title="Approved with exclusions">
                    <p className="text-sm">
                      {batch.validationStatus.excludedEmployeeCount} employee(s) were left out because
                      payroll was not calculated. The batch includes {batch.totalEmployees} employee(s)
                      with payroll.
                    </p>
                    <div className="mt-3">
                      <MissingPayrollEmployeesAlert
                        details={batch.validationStatus.excludedEmployeeDetails}
                      />
                    </div>
                  </LoanFormInfo>
                )}

              {(batch.validationStatus?.salaryPendingEmployeeDetails?.length ?? 0) > 0 &&
                batch.status === "pending" && (
                  <LoanFormError>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Salary pending approval</p>
                        <p className="mt-1 text-sm">
                          These employees are excluded from this batch until salary is finalized on the employee profile and payroll is recalculated.
                        </p>
                        <div className="mt-2 text-sm">
                          <MissingPayrollEmployeesAlert
                            details={batch.validationStatus?.salaryPendingEmployeeDetails}
                          />
                        </div>
                      </div>
                    </div>
                  </LoanFormError>
                )}

              {(batch.validationStatus?.salaryHeldEmployeeDetails?.length ?? 0) > 0 &&
                batch.status !== "complete" && (
                  <LoanFormError>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Salary on hold</p>
                        <p className="mt-1 text-sm">
                          These employees are excluded from paysheet export and this batch payout list until hold is released.
                        </p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {(batch.validationStatus?.salaryHeldEmployeeDetails || []).map((e) => (
                            <li key={e.employeeId || e.emp_no}>
                              {e.emp_no} — {e.employee_name}
                              {e.salaryHoldReason ? ` (${e.salaryHoldReason})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </LoanFormError>
                )}

              {(batch.validationStatus?.continuousAbsentEmployees?.length ?? 0) > 0 &&
                batch.status !== "complete" && (
                  <LoanFormError>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Continuous 3-day absent</p>
                        <p className="mt-1 text-sm">
                          Verify these employees before completing this batch. Streak can include days after this pay period when the batch is still open.
                        </p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {(batch.validationStatus?.continuousAbsentEmployees || []).map((e) => (
                            <li key={e.emp_no}>
                              {e.emp_no} — {e.employee_name}: {e.fromDate} → {e.toDate}
                              {e.days ? ` (${e.days} days)` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </LoanFormError>
                )}

              {batch.validationStatus &&
                !batch.validationStatus.allEmployeesCalculated &&
                batch.status === "pending" && (
                  <LoanFormError>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Validation warning</p>
                        <div className="mt-2 text-sm">
                          <MissingPayrollEmployeesAlert
                            details={batch.validationStatus?.missingEmployeeDetails}
                            missingEmployeeIds={batch.validationStatus?.missingEmployees}
                          />
                          <Link
                            href={payRegisterPathFromIssues(payRegisterBasePath, [
                              {
                                batchId: String(batch._id),
                                batchLabel: batch.department?.name || batch.batchNumber,
                                month: batch.month,
                                departmentId: batch.department?._id,
                                divisionId:
                                  typeof batch.division === "object"
                                    ? batch.division?._id
                                    : batch.division,
                                missingEmployees:
                                  batch.validationStatus?.missingEmployeeDetails || [],
                              },
                            ])}
                            className={`mt-3 inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
                            style={loansPrimaryButtonStyle()}
                          >
                            Go to pay register
                          </Link>
                        </div>
                      </div>
                    </div>
                  </LoanFormError>
                )}
            </div>

            <LoanDetailSection highlight className="h-fit">
              <LoanDetailSectionTitle>Batch information</LoanDetailSectionTitle>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Created by</dt>
                  <dd className="font-medium text-stone-900 dark:text-stone-100">
                    {batch.createdBy?.name || "Unknown"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Created at</dt>
                  <dd className="font-medium text-stone-900 dark:text-stone-100">
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">Last updated</dt>
                  <dd className="font-medium text-stone-900 dark:text-stone-100">
                    {new Date(batch.updatedAt).toLocaleDateString()}
                  </dd>
                </div>
                {batch.approvedBy && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-stone-500">Approved by</dt>
                    <dd className="font-medium text-stone-900 dark:text-stone-100">
                      {batch.approvedBy.name}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 space-y-2 border-t pt-4" style={{ borderColor: "var(--ps-accent-border)" }}>
                {batch.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleStatusAction("approve")}
                    className={`flex w-full items-center justify-center gap-2 ${loansPrimaryButtonClass()}`}
                    style={loansPrimaryButtonStyle()}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Approve batch
                  </button>
                )}
                {batch.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => handleStatusAction("freeze")}
                    className={`flex w-full items-center justify-center gap-2 ${loansDialogOutlineButtonClass()}`}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    <Snowflake className="h-4 w-4" />
                    Freeze batch
                  </button>
                )}
                {batch.status === "freeze" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusAction("complete")}
                      className={`flex w-full items-center justify-center gap-2 ${loansPrimaryButtonClass()}`}
                      style={loansPrimaryButtonStyle()}
                    >
                      <CheckCheck className="h-4 w-4" />
                      Mark as complete
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusAction("unfreeze")}
                      className={`flex w-full items-center justify-center gap-2 ${loansDialogOutlineButtonClass()}`}
                      style={loansDialogOutlineButtonStyle()}
                    >
                      <History className="h-4 w-4" />
                      Revert to approved
                    </button>
                  </>
                )}
              </div>
            </LoanDetailSection>
          </div>
        )}

        {activeTab === "employees" && (
          <div className="overflow-x-auto border" style={{ borderColor: "var(--ps-accent-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                  <th className="px-4 py-3 text-left font-semibold">Select</th>
                  <th className="px-4 py-3 text-left font-semibold">Employee</th>
                  <th className="px-4 py-3 text-right font-semibold">Basic pay</th>
                  <th className="px-4 py-3 text-right font-semibold">Allowances</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Deductions</th>
                  <th className="px-4 py-3 text-right font-semibold">Arrears</th>
                  <th className="px-4 py-3 text-right font-semibold">Net salary</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {batch.employeePayrolls && batch.employeePayrolls.length > 0 ? (
                  batch.employeePayrolls.map((empPayroll: any) => {
                    const designation =
                      (typeof empPayroll.employeeId?.designation_id === "object" &&
                        empPayroll.employeeId?.designation_id?.name) ||
                      (typeof empPayroll.employeeId?.designation === "object" &&
                        empPayroll.employeeId?.designation?.name) ||
                      "";
                    const batchContinuousAbsentEntry =
                      batch.validationStatus?.continuousAbsentEmployees?.find((entry: any) => {
                        const empNo = String(empPayroll.employeeId?.emp_no || empPayroll.emp_no || "").toUpperCase();
                        return String(entry.emp_no || "").toUpperCase() === empNo;
                      });
                    const rowContinuousAbsent =
                      empPayroll.continuousAbsent ||
                      (batchContinuousAbsentEntry
                        ? {
                            active: true,
                            fromDate: batchContinuousAbsentEntry.fromDate,
                            toDate: batchContinuousAbsentEntry.toDate,
                            days: batchContinuousAbsentEntry.days,
                          }
                        : null);
                    return (
                      <tr
                        key={empPayroll._id}
                        className="border-b transition hover:bg-stone-50 dark:hover:bg-stone-900/40"
                        style={{ borderColor: "var(--ps-accent-border)" }}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedPayrollRecordIds.includes(empPayroll._id)}
                            onChange={() => handleTogglePayrollSelection(empPayroll._id)}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <PayrollBatchEmployeeCell
                            source={{
                              employee_name: empPayroll.employeeId?.employee_name || empPayroll.employeeId?.name,
                              emp_no: empPayroll.employeeId?.emp_no || empPayroll.emp_no,
                              designation,
                              department:
                                typeof empPayroll.employeeId?.department_id === "object"
                                  ? empPayroll.employeeId.department_id?.name
                                  : empPayroll.employeeId?.department_id,
                              division:
                                typeof empPayroll.employeeId?.division_id === "object"
                                  ? empPayroll.employeeId.division_id?.name
                                  : empPayroll.employeeId?.division_id,
                              qualificationStatus: empPayroll.employeeId?.qualificationStatus,
                              salaryStatus: empPayroll.employeeId?.salaryStatus,
                              salaryOnHold: empPayroll.salaryOnHold ?? empPayroll.employeeId?.salaryOnHold,
                              salaryHoldReason: empPayroll.salaryHoldReason ?? empPayroll.employeeId?.salaryHoldReason,
                              continuousAbsent: rowContinuousAbsent,
                              employeeId: empPayroll.employeeId,
                            }}
                            batchComplete={batch.status === "complete"}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(empPayroll.earnings?.basicPay || 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(empPayroll.earnings?.totalAllowances || 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatCurrency(empPayroll.earnings?.grossSalary || 0)}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums ${ledgerMoneyClass(true)}`}>
                          {formatCurrency(empPayroll.deductions?.totalDeductions || 0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">
                          {formatCurrency(empPayroll.arrearsAmount || 0)}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${ledgerMoneyClass()}`}>
                          {formatCurrency(empPayroll.netSalary || 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={ledgerStatusBadgeClass("neutral")}>{empPayroll.status}</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-stone-500">
                      No employee payrolls found in this batch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-6">
            <LoanDetailSection>
              <LoanDetailSectionTitle>Salary hold history</LoanDetailSectionTitle>
              {holdHistoryLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading hold history…
                </div>
              ) : holdHistory.length > 0 ? (
                <div className="space-y-3">
                  {holdHistory.map((item: any) => (
                    <div key={item._id} className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.action === "hold" ? "Salary hold applied" : "Salary hold released"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.emp_no || "—"} · {item.previousReason ? `Previous: ${item.previousReason}` : "No previous reason"}
                          </p>
                        </div>
                        <time className="text-xs text-slate-500">
                          {new Date(item.performedAt || item.createdAt).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {item.reason || "No reason provided"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        By {item.performedBy?.name || "Unknown user"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-stone-500">No salary-hold activity yet.</p>
              )}
            </LoanDetailSection>

            <LoanDetailSection>
              <LoanDetailSectionTitle>Batch activity history</LoanDetailSectionTitle>
              <div className="space-y-6">
              {[
                ...(batch.statusHistory || []).map((h) => ({ ...h, type: "status_change" as const, date: h.changedAt })),
                ...(batch.recalculationHistory || []).map((h) => ({
                  ...h,
                  type: "recalculation" as const,
                  date: h.recalculatedAt,
                })),
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item: any, index) => (
                  <div
                    key={index}
                    className="border p-4"
                    style={{ borderColor: "var(--ps-accent-border)", backgroundColor: "var(--ps-accent-soft)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {item.type === "status_change" ? (
                          <span className={ledgerStatusBadgeClass(batchLedgerStatus(item.status))}>
                            {item.status}
                          </span>
                        ) : (
                          <RefreshCw className="h-4 w-4" style={{ color: "var(--ps-accent)" }} />
                        )}
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          {item.type === "status_change"
                            ? `Status changed to ${String(item.status).toUpperCase()}`
                            : "Payroll recalculated"}
                        </p>
                      </div>
                      <time className="text-xs text-stone-500">{new Date(item.date).toLocaleString()}</time>
                    </div>
                    <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                      {item.type === "status_change" ? (
                        <>
                          Changed by{" "}
                          <span className="font-medium">{item.changedBy?.name || "Unknown"}</span>
                        </>
                      ) : (
                        <>
                          Recalculated by{" "}
                          <span className="font-medium">{item.recalculatedBy?.name || "Unknown"}</span>
                        </>
                      )}
                    </p>
                    {item.reason && (
                      <p className="mt-2 border-l-2 pl-3 text-xs italic text-stone-500" style={{ borderColor: "var(--ps-accent)" }}>
                        &ldquo;{item.reason}&rdquo;
                      </p>
                    )}
                    {item.type === "recalculation" && item.previousSnapshot && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                        <div>Prev net: {formatCurrency(item.previousSnapshot.totalNetSalary)}</div>
                        <div>Prev gross: {formatCurrency(item.previousSnapshot.totalGrossSalary)}</div>
                      </div>
                    )}
                  </div>
                ))}

                {!batch.statusHistory?.length && !batch.recalculationHistory?.length && (
                  <p className="py-8 text-center text-sm text-stone-500">No activity history found.</p>
                )}
              </div>
            </LoanDetailSection>
          </div>
        )}
      </LoansContentPanel>

      <MissingPayrollWarningDialog
        open={missingPayrollWarningOpen}
        onClose={() => setMissingPayrollWarningOpen(false)}
        issues={missingPayrollIssues}
        payRegisterBasePath={payRegisterBasePath}
        onProceedAnyway={handleProceedAnywayApprove}
        proceedAnywayLoading={proceedAnywayLoading}
      />

      <SalaryPendingWarningDialog
        open={salaryPendingWarningOpen}
        onClose={() => setSalaryPendingWarningOpen(false)}
        employees={salaryPendingIssues.flatMap((i) => i.salaryPendingEmployees)}
        summary={
          salaryPendingIssues.length
            ? `Finalize salary for the employee(s) below, recalculate payroll, then approve batch ${salaryPendingIssues[0]?.batchLabel || ""}.`
            : undefined
        }
      />

      <LoanDetailDialog open={openDialog && !!actionType} onClose={() => setOpenDialog(false)} maxWidth="max-w-md">
        {actionType && (
          <>
            <LoanDetailDialogHeader
              badge="Batch action"
              title={actionDialogTitle[actionType]}
              onClose={() => setOpenDialog(false)}
            />
            <LoanDetailDialogBody>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Are you sure you want to <strong>{actionType}</strong> this payroll batch for{" "}
                <span className="font-medium text-stone-900 dark:text-stone-100">
                  {batch.department?.name}
                </span>{" "}
                ({batch.monthName || batch.month})?
              </p>
              <div>
                <LoanFormLabel>Reason / comments (optional)</LoanFormLabel>
                <textarea
                  className={`mt-1.5 min-h-[100px] ${loansFormTextareaClass()}`}
                  style={loansFormInputStyle()}
                  placeholder="Optional note…"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>
              {actionType === "approve" && (
                <LoanFormInfo title="Note">
                  This will lock the batch for recalculation unless permission is granted.
                </LoanFormInfo>
              )}
              {actionType === "complete" && (
                <LoanFormInfo title="Note">
                  Marking complete is final. Ensure all data is correct.
                </LoanFormInfo>
              )}
              <LoanDialogFooter
                onCancel={() => setOpenDialog(false)}
                submitLabel="Confirm"
                onSubmit={handleActionConfirm}
                loading={actionLoading}
                submitDisabled={actionLoading}
              />
            </LoanDetailDialogBody>
          </>
        )}
      </LoanDetailDialog>
    </LoansPageShell>
  );
}
