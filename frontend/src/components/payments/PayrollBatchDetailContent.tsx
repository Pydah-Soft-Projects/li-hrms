"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
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
import { MissingPayrollEmployeesAlert } from "@/components/payments/MissingPayrollEmployeesAlert";
import MissingPayrollWarningDialog from "@/components/payments/MissingPayrollWarningDialog";
import {
  collectApproveValidationIssues,
  isMissingPayrollError,
  payRegisterPathFromIssues,
  type BatchPayrollValidationIssue,
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
  const [proceedAnywayLoading, setProceedAnywayLoading] = useState(false);

  useEffect(() => {
    if (batchId) {
      fetchBatchDetails();
    }
  }, [batchId]);

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
                    return (
                      <tr
                        key={empPayroll._id}
                        className="border-b transition hover:bg-stone-50 dark:hover:bg-stone-900/40"
                        style={{ borderColor: "var(--ps-accent-border)" }}
                      >
                        <td className="px-4 py-3">
                          <div
                            className="min-w-0"
                            title={[empPayroll.employeeId?.name || empPayroll.emp_no || "—", designation, empPayroll.emp_no]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            <div className="truncate font-medium text-stone-900 dark:text-stone-100">
                              {empPayroll.employeeId?.name || empPayroll.emp_no || "—"}
                            </div>
                            {designation ? (
                              <div className="mt-0.5 truncate text-[10px] italic text-stone-500">
                                {String(designation)}
                              </div>
                            ) : null}
                            {empPayroll.emp_no ? (
                              <div className="mt-0.5 truncate text-[10px] text-stone-400">
                                {empPayroll.emp_no}
                              </div>
                            ) : null}
                          </div>
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
                    <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                      No employee payrolls found in this batch.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "history" && (
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
