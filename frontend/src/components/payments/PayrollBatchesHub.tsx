"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast, ToastContainer } from "react-toastify";
import { api, PayrollBatch, PayrollBatchStatus, Department, Division } from "@/lib/api";
import Spinner from "@/components/Spinner";
import {
  RefreshCw,
  Search,
  Eye,
  CheckCircle,
  Snowflake,
  CheckCheck,
  Loader2,
} from "lucide-react";
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansTabBar,
  LoansToolbar,
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
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansFormTextareaClass,
} from "@/components/loans/LoanDetailDialogShell";
import { ledgerMoneyClass, ledgerStatusBadgeClass, type LedgerUiStatus } from "@/lib/ledgerUi";
import {
  groupBatchesForUi,
  batchesEligibleForAction,
  type DivisionGroup,
} from "@/components/payments/payrollBatchUtils";
import MissingPayrollWarningDialog from "@/components/payments/MissingPayrollWarningDialog";
import {
  collectApproveValidationIssues,
  issuesFromBulkApproveErrors,
  isMissingPayrollError,
  type BatchPayrollValidationIssue,
  type BulkApproveErrorEntry,
} from "@/lib/payrollBatchValidation";

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

const PAYMENT_STATUS_OPTIONS = [
  { id: "pending", name: "Pending" },
  { id: "approved", name: "Approved" },
  { id: "freeze", name: "Frozen" },
  { id: "complete", name: "Completed" },
];

export type PayrollBatchesHubProps = {
  detailBasePath: string;
  payRegisterBasePath: string;
  showDivisionFilter?: boolean;
};

const TABLE_LIMIT = 10;
const GROUP_FETCH_LIMIT = 100;
const GROUP_MAX_PAGES = 80;

async function fetchAllPayrollBatchesPage(
  base: {
    month?: string;
    departmentId?: string;
    divisionId?: string;
    status?: string;
  },
): Promise<{ batches: PayrollBatch[]; total: number }> {
  let page = 1;
  const all: PayrollBatch[] = [];
  let total = 0;

  while (page <= GROUP_MAX_PAGES) {
    const res = await api.getPayrollBatches({ ...base, page, limit: GROUP_FETCH_LIMIT });
    if (!res.success || !Array.isArray(res.data)) break;
    all.push(...(res.data as PayrollBatch[]));
    const t = typeof (res as any).total === "number" ? (res as any).total : (res as any).count;
    total = typeof t === "number" ? t : all.length;
    if (res.data.length < GROUP_FETCH_LIMIT || all.length >= total) break;
    page++;
  }

  return { batches: all, total };
}

export default function PayrollBatchesHub({
  detailBasePath,
  payRegisterBasePath,
  showDivisionFilter = false,
}: PayrollBatchesHubProps) {
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"table" | "by-division">("by-division");
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [groupedBatchesRaw, setGroupedBatchesRaw] = useState<PayrollBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupLoadMeta, setGroupLoadMeta] = useState<{ loaded: number; total: number } | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedDivision, setSelectedDivision] = useState<string>("");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedDivs, setExpandedDivs] = useState<Record<string, boolean>>({});

  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"single" | "bulk">("single");
  const [actionType, setActionType] = useState<"approve" | "freeze" | "complete" | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<PayrollBatch | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [missingPayrollWarningOpen, setMissingPayrollWarningOpen] = useState(false);
  const [missingPayrollIssues, setMissingPayrollIssues] = useState<BatchPayrollValidationIssue[]>([]);
  const [missingPayrollSummary, setMissingPayrollSummary] = useState<string | undefined>();
  /** Full batch set to approve on "Proceed anyway" (not only batches listed in the warning). */
  const [pendingApproveBatchIds, setPendingApproveBatchIds] = useState<string[]>([]);
  const [proceedAnywayLoading, setProceedAnywayLoading] = useState(false);

  const actionLabels = {
    approve: "Approved",
    freeze: "Frozen",
    complete: "Completed",
  };

  const actionDialogTitle = {
    approve: "Approve payroll batch(es)",
    freeze: "Freeze payroll batch(es)",
    complete: "Mark batch(es) complete",
  };

  const filterParams = useMemo(
    () => ({
      month,
      ...(selectedDept !== "all" ? { departmentId: selectedDept } : {}),
      ...(showDivisionFilter && selectedDivision && selectedDivision !== "all"
        ? { divisionId: selectedDivision }
        : {}),
      ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
    }),
    [month, selectedDept, selectedDivision, selectedStatus, showDivisionFilter],
  );

  const groupedStructure = useMemo(() => groupBatchesForUi(groupedBatchesRaw), [groupedBatchesRaw]);

  const idToBatch = useMemo(() => {
    const map = new Map<string, PayrollBatch>();
    const src = viewMode === "by-division" ? groupedBatchesRaw : batches;
    for (const b of src) {
      map.set(String(b._id), b);
    }
    return map;
  }, [viewMode, groupedBatchesRaw, batches]);

  const selectedBatchObjects = useMemo(
    () => selectedIds.map((id) => idToBatch.get(id)).filter(Boolean) as PayrollBatch[],
    [selectedIds, idToBatch],
  );

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await api.getDepartments();
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (e) {
      console.error("Error fetching departments:", e);
    }
  }, []);

  const fetchDivisions = useCallback(async () => {
    if (!showDivisionFilter) return;
    try {
      const response = await api.getDivisions();
      if (response.success && response.data) {
        setDivisions(response.data || []);
      }
    } catch (e) {
      console.error("Error fetching divisions:", e);
    }
  }, [showDivisionFilter]);

  useEffect(() => {
    fetchDepartments();
    fetchDivisions();
  }, [fetchDepartments, fetchDivisions]);

  useEffect(() => {
    setSelectedIds([]);
  }, [month, selectedDept, selectedDivision, selectedStatus, viewMode]);

  useEffect(() => {
    setPage(1);
  }, [month, selectedDept, selectedDivision, selectedStatus, viewMode]);

  const fetchTableBatches = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        ...filterParams,
        page,
        limit: TABLE_LIMIT,
      };
      const response = await api.getPayrollBatches(params);
      if (response.success && Array.isArray(response.data)) {
        setBatches(response.data as PayrollBatch[]);
        const total =
          typeof (response as any).total === "number"
            ? (response as any).total
            : typeof (response as any).count === "number"
              ? (response as any).count
              : response.data.length;
        setTotalPages(Math.max(1, Math.ceil(total / TABLE_LIMIT)));
      } else {
        setBatches([]);
        toast.error("Failed to load payroll batches");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load payroll batches");
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams, page]);

  const fetchGroupedBatches = useCallback(async () => {
    try {
      setLoading(true);
      const { batches: all, total } = await fetchAllPayrollBatchesPage(filterParams);
      setGroupedBatchesRaw(all);
      setGroupLoadMeta({ loaded: all.length, total });
      if (total > all.length) {
        toast.warning(`Showing ${all.length} of ${total} batches (load cap). Narrow filters or use table view.`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load payroll batches");
      setGroupedBatchesRaw([]);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    if (viewMode === "table") {
      fetchTableBatches();
    } else {
      fetchGroupedBatches();
    }
  }, [viewMode, fetchTableBatches, fetchGroupedBatches]);

  const refresh = () => {
    if (viewMode === "table") fetchTableBatches();
    else fetchGroupedBatches();
  };

  const toggleExpanded = (key: string) => {
    setExpandedDivs((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleSelectId = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllInDivision = (div: DivisionGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const ids = div.batches.map((b) => String(b._id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => setSelectedIds([]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const openSingleAction = (batch: PayrollBatch, action: "approve" | "freeze" | "complete") => {
    setDialogMode("single");
    setSelectedBatch(batch);
    setActionType(action);
    setActionReason("");
    setOpenDialog(true);
  };

  const openBulkAction = (action: "approve" | "freeze" | "complete") => {
    const eligible = batchesEligibleForAction(selectedBatchObjects, action);
    if (!eligible.length) {
      toast.warning("No selected batches are eligible for this action.");
      return;
    }
    setDialogMode("bulk");
    setSelectedBatch(null);
    setActionType(action);
    setActionReason("");
    setOpenDialog(true);
  };

  const batchesById = useMemo(() => {
    const map = new Map<string, PayrollBatch>();
    for (const b of [...batches, ...groupedBatchesRaw]) {
      map.set(String(b._id), b);
    }
    return map;
  }, [batches, groupedBatchesRaw]);

  const showMissingPayrollWarning = (
    issues: BatchPayrollValidationIssue[],
    summary?: string,
    batchIdsForProceed?: string[],
  ) => {
    if (!issues.length) return false;
    setMissingPayrollIssues(issues);
    setMissingPayrollSummary(summary);
    setPendingApproveBatchIds(
      batchIdsForProceed?.length
        ? batchIdsForProceed
        : issues.map((i) => i.batchId),
    );
    setMissingPayrollWarningOpen(true);
    setOpenDialog(false);
    return true;
  };

  const handleActionConfirm = async () => {
    if (!actionType) return;

    try {
      setActionLoading(true);

      if (actionType === "approve") {
        const approveTargets =
          dialogMode === "single" && selectedBatch
            ? [selectedBatch]
            : batchesEligibleForAction(selectedBatchObjects, "approve");

        const precheckIssues = await collectApproveValidationIssues(approveTargets);
        if (precheckIssues.length) {
          const totalSelected = approveTargets.length;
          const withIssues = precheckIssues.length;
          showMissingPayrollWarning(
            precheckIssues,
            `${withIssues} of ${totalSelected} selected batch(es) have employees without payroll. Proceed anyway will approve all ${totalSelected} selected batch(es) (ready employees included; missing payroll excluded per batch).`,
            approveTargets.map((b) => String(b._id)),
          );
          return;
        }
      }

      if (dialogMode === "single") {
        if (!selectedBatch) return;
        let response;
        switch (actionType) {
          case "approve":
            response = await api.approveBatch(selectedBatch._id, actionReason);
            break;
          case "freeze":
            response = await api.freezeBatch(selectedBatch._id, actionReason);
            break;
          case "complete":
            response = await api.completeBatch(selectedBatch._id, actionReason);
            break;
        }
        if (response?.success) {
          toast.success(`Batch ${actionLabels[actionType]} successfully`);
          setOpenDialog(false);
          refresh();
        } else if (
          actionType === "approve" &&
          (response?.missingEmployees?.length || isMissingPayrollError(response?.message))
        ) {
          const missing =
            response.missingEmployees ||
            [];
          showMissingPayrollWarning(
            [
              {
                batchId: String(selectedBatch._id),
                batchLabel: selectedBatch.department?.name || selectedBatch.batchNumber,
                month: selectedBatch.month,
                departmentId:
                  typeof selectedBatch.department === "object"
                    ? selectedBatch.department._id
                    : undefined,
                divisionId:
                  typeof selectedBatch.division === "object"
                    ? selectedBatch.division._id
                    : typeof selectedBatch.division === "string"
                      ? selectedBatch.division
                      : undefined,
                missingEmployees: missing,
              },
            ],
            undefined,
            [String(selectedBatch._id)],
          );
        } else {
          toast.error(response?.message || "Action failed");
        }
        return;
      }

      const eligible = batchesEligibleForAction(selectedBatchObjects, actionType);
      const ids = eligible.map((b) => String(b._id));
      let response: any;
      switch (actionType) {
        case "approve":
          response = await api.bulkApproveBatches(ids, actionReason);
          break;
        case "freeze":
          response = await api.bulkFreezeBatches(ids, actionReason);
          break;
        case "complete":
          response = await api.bulkCompleteBatches(ids, actionReason);
          break;
      }
      if (response?.success) {
        const errs = (response.errors || []) as BulkApproveErrorEntry[];
        const payrollIssues =
          actionType === "approve" ? issuesFromBulkApproveErrors(errs, batchesById) : [];

        if (payrollIssues.length) {
          const succeeded = Array.isArray(response.data) ? response.data.length : 0;
          const failedIds = errs.map((e) => String(e.batchId));
          showMissingPayrollWarning(
            payrollIssues,
            succeeded > 0
              ? `${succeeded} batch(es) approved. ${errs.length} remaining batch(es) have employees without payroll — proceed anyway to approve those with ready payroll.`
              : `${errs.length} batch(es) have employees without payroll. Proceed anyway to approve employees who are ready.`,
            failedIds,
          );
          if (succeeded > 0) {
            toast.info(response.message || `Approved ${succeeded} batch(es)`);
          }
        } else {
          toast.success(response.message || `Bulk ${actionLabels[actionType].toLowerCase()}`);
          if (errs.length) {
            toast.error(`${errs.length} batch(es) failed. First: ${errs[0].error || "Unknown error"}`);
          }
        }
        setOpenDialog(false);
        setSelectedIds([]);
        refresh();
      } else {
        toast.error(response?.message || "Bulk action failed");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleProceedAnywayApprove = async () => {
    const batchIds =
      pendingApproveBatchIds.length > 0
        ? pendingApproveBatchIds
        : missingPayrollIssues.map((i) => i.batchId);
    if (!batchIds.length) return;

    const toApprove = batchIds.filter((id) => {
      const b = batchesById.get(id);
      return !b || b.status === "pending";
    });

    if (!toApprove.length) {
      toast.info("Selected batches are already approved.");
      setMissingPayrollWarningOpen(false);
      setPendingApproveBatchIds([]);
      return;
    }

    try {
      setProceedAnywayLoading(true);
      let response: any;

      if (toApprove.length === 1) {
        response = await api.approveBatch(toApprove[0], actionReason, { proceedAnyway: true });
      } else {
        response = await api.bulkApproveBatches(toApprove, actionReason, { proceedAnyway: true });
      }

      if (response?.success) {
        const errs = (response.errors || []) as BulkApproveErrorEntry[];
        const succeeded = Array.isArray(response.data) ? response.data.length : toApprove.length;

        if (errs.length > 0) {
          const payrollIssues = issuesFromBulkApproveErrors(errs, batchesById);
          if (payrollIssues.length) {
            showMissingPayrollWarning(
              payrollIssues,
              `${succeeded} of ${toApprove.length} batch(es) approved. ${errs.length} still need attention (e.g. no payroll calculated yet).`,
              errs.map((e) => String(e.batchId)),
            );
          } else {
            toast.error(`${errs.length} batch(es) failed. First: ${errs[0]?.error || "Unknown error"}`);
            setMissingPayrollWarningOpen(false);
            setPendingApproveBatchIds([]);
          }
          if (succeeded > 0) {
            toast.success(`Approved ${succeeded} batch(es)`);
          }
        } else {
          toast.success(
            response.message ||
              (toApprove.length === 1
                ? "Batch approved (excluded employees without payroll where applicable)"
                : `Approved ${succeeded} batch(es)`),
          );
          setMissingPayrollWarningOpen(false);
          setPendingApproveBatchIds([]);
          setOpenDialog(false);
          setSelectedIds([]);
        }
        refresh();
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

  const countEligible = (action: "approve" | "freeze" | "complete") =>
    batchesEligibleForAction(selectedBatchObjects, action).length;

  const listDepartmentOptions = useMemo(() => {
    if (!showDivisionFilter || !selectedDivision || selectedDivision === "all") return departments;
    const currentDiv = divisions.find((d) => d._id === selectedDivision);
    const allowed = new Set<string>();
    const deptIds = ((currentDiv?.departments ?? []) as unknown[]).map((d) =>
      typeof d === "string" ? d : (d as { _id?: string })?._id,
    );
    if (deptIds.length) {
      deptIds.forEach((id) => { if (id) allowed.add(String(id)); });
    } else {
      departments
        .filter((d: Department & { division_id?: string; division?: string }) =>
          String(d.division_id || d.division) === String(selectedDivision))
        .forEach((d) => allowed.add(String(d._id)));
    }
    if (allowed.size === 0) return departments;
    return departments.filter((d) => allowed.has(String(d._id)));
  }, [showDivisionFilter, selectedDivision, divisions, departments]);

  const statsSource = viewMode === "by-division" ? groupedBatchesRaw : batches;
  const batchStats = useMemo(() => ({
    total: viewMode === "by-division" ? groupedBatchesRaw.length : (groupLoadMeta?.total ?? batches.length),
    pending: statsSource.filter((b) => b.status === "pending").length,
    selected: selectedIds.length,
    complete: statsSource.filter((b) => b.status === "complete").length,
  }), [viewMode, groupedBatchesRaw, batches, groupLoadMeta, statsSource, selectedIds.length]);

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <LoansPageHeader
        badge="Finance · Payroll"
        title="Payroll payments"
        subtitle="Review batches by division, approve, freeze, and mark complete."
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className={`inline-flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        }
      />

      <LoansStatGrid
        stats={[
          { label: "Batches", value: batchStats.total, accent: true },
          { label: "Pending", value: batchStats.pending },
          { label: "Selected", value: batchStats.selected },
          { label: "Completed", value: batchStats.complete, muted: batchStats.complete === 0 },
        ]}
      />

      <LoansTabBar
        activeTab={viewMode}
        onChange={(id) => setViewMode(id as "table" | "by-division")}
        tabs={[
          { id: "by-division", label: "By division" },
          { id: "table", label: "Table" },
        ]}
      />

      <LoansToolbar>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <LoanFormLabel>Pay period</LoanFormLabel>
            <input
              type="month"
              className={loansFormInputClass()}
              style={loansFormInputStyle()}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          {showDivisionFilter && (
            <div className="min-w-[180px]">
              <LoanFormLabel>Division</LoanFormLabel>
              <select
                className={loansFormSelectClass()}
                style={loansFormInputStyle()}
                value={selectedDivision}
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  setSelectedDept("all");
                }}
              >
                <option value="">All divisions</option>
                {divisions.map((div) => (
                  <option key={div._id} value={div._id}>{div.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-[180px]">
            <LoanFormLabel>Department</LoanFormLabel>
            <select
              className={loansFormSelectClass()}
              style={loansFormInputStyle()}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            >
              <option value="all">All departments</option>
              {listDepartmentOptions.map((dept) => (
                <option key={dept._id} value={dept._id}>{dept.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <LoanFormLabel>Status</LoanFormLabel>
            <select
              className={loansFormSelectClass()}
              style={loansFormInputStyle()}
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              {PAYMENT_STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>
        {viewMode === "by-division" && groupLoadMeta && (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            Loaded {groupLoadMeta.loaded} batch(es)
            {groupLoadMeta.total > groupLoadMeta.loaded ? ` of ${groupLoadMeta.total}` : ""}.
          </p>
        )}
      </LoansToolbar>

      {viewMode === "by-division" ? (
        <div className="space-y-4">
            {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-stone-500">
              <Spinner />
              Loading batches…
            </div>
          ) : groupedStructure.length === 0 ? (
            <div className="border bg-white py-16 text-center text-stone-500 dark:bg-stone-950" style={{ borderColor: "var(--ps-accent-border)" }}>
              <Search className="mx-auto mb-2 h-10 w-10 text-stone-300" />
              <p className="font-medium">No payroll batches for this filter</p>
            </div>
          ) : (
            groupedStructure.map((div) => {
              const expanded = !!expandedDivs[div.key];
              const pending = div.batches.filter((b) => b.status === "pending").length;
              const approved = div.batches.filter((b) => b.status === "approved").length;
              const frozen = div.batches.filter((b) => b.status === "freeze").length;
              const done = div.batches.filter((b) => b.status === "complete").length;
              const totalNet = div.batches.reduce((s, b) => s + (Number(b.totalNetSalary) || 0), 0);

              return (
                <div
                  key={div.key}
                  className="overflow-hidden border bg-white dark:bg-stone-950"
                  style={{ borderColor: "var(--ps-accent-border)" }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(div.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpanded(div.key);
                      }
                    }}
                    className="flex w-full cursor-pointer flex-col gap-3 px-5 py-4 transition hover:opacity-95 sm:flex-row sm:items-center sm:justify-between"
                    style={{ backgroundColor: "var(--ps-accent-soft)" }}
                  >
                    <div>
                      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{div.label}</h2>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {div.batches.length} batch(es) ·{" "}
                        <span className={ledgerMoneyClass()}>{formatCurrency(totalNet)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={ledgerStatusBadgeClass("pending")}>P {pending}</span>
                      <span className={ledgerStatusBadgeClass("approved")}>A {approved}</span>
                      <span className={ledgerStatusBadgeClass("neutral")}>F {frozen}</span>
                      <span className={ledgerStatusBadgeClass("approved")}>C {done}</span>
                      <button
                        type="button"
                        onClick={(e) => selectAllInDivision(div, e)}
                        className="ml-2 text-[11px] font-semibold hover:underline"
                        style={{ color: "var(--ps-accent)" }}
                      >
                        Select all
                      </button>
                      <span className="ml-1 text-sm text-stone-400">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="divide-y" style={{ borderColor: "var(--ps-accent-border)" }}>
                      {div.departments.map((dep) => (
                        <div key={dep.deptId} className="px-4 py-3">
                          <h3 className="mb-2 pl-1 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--ps-accent-ink)" }}>
                            {dep.deptName}
                          </h3>
                          <div className="overflow-x-auto border" style={{ borderColor: "var(--ps-accent-border)" }}>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                                  <th className="w-10 py-2 pl-3 text-left" />
                                  <th className="px-3 py-2 text-left font-semibold">Batch</th>
                                  <th className="px-3 py-2 text-left font-semibold">Period</th>
                                  <th className="px-3 py-2 text-center font-semibold">Emp</th>
                                  <th className="px-3 py-2 text-right font-semibold">Net</th>
                                  <th className="px-3 py-2 text-center font-semibold">Status</th>
                                  <th className="px-3 py-2 text-center font-semibold">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dep.batches.map((batch) => (
                                  <tr
                                    key={batch._id}
                                    className="cursor-pointer border-b transition hover:bg-stone-50 dark:hover:bg-stone-900/40"
                                    style={{ borderColor: "var(--ps-accent-border)" }}
                                    onClick={() => router.push(`${detailBasePath}/${batch._id}`)}
                                  >
                                    <td className="py-2 pl-3" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        style={{ accentColor: "var(--ps-accent)" }}
                                        checked={selectedIds.includes(String(batch._id))}
                                        onChange={() => toggleSelectId(String(batch._id))}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 font-semibold" style={{ color: "var(--ps-accent)" }}>
                                      {batch.batchNumber}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-stone-700 dark:text-stone-300">
                                      {batch.monthName || batch.month}
                                    </td>
                                    <td className="px-3 py-2 text-center">{batch.totalEmployees}</td>
                                    <td className={`whitespace-nowrap px-3 py-2 text-right ${ledgerMoneyClass()}`}>
                                      {formatCurrency(batch.totalNetSalary)}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={ledgerStatusBadgeClass(batchLedgerStatus(batch.status))}>
                                        {statusLabels[batch.status] || batch.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex justify-center gap-0.5">
                                        <Link
                                          href={`${detailBasePath}/${batch._id}`}
                                          className="p-1.5 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                                          title="View"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Link>
                                        {batch.status === "pending" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "approve")}
                                            className="p-1.5 text-stone-400 hover:text-emerald-600"
                                            title="Approve"
                                          >
                                            <CheckCircle className="h-4 w-4" />
                                          </button>
                                        )}
                                        {batch.status === "approved" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "freeze")}
                                            className="p-1.5 text-stone-400 hover:text-stone-800"
                                            title="Freeze"
                                          >
                                            <Snowflake className="h-4 w-4" />
                                          </button>
                                        )}
                                        {batch.status === "freeze" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "complete")}
                                            className="p-1.5 text-stone-400 hover:text-emerald-600"
                                            title="Complete"
                                          >
                                            <CheckCheck className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <LoansContentPanel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                  <th className="w-10 px-3 py-3" />
                  <th className="px-4 py-3 text-left font-semibold">Batch</th>
                  {showDivisionFilter && (
                    <th className="px-4 py-3 text-left font-semibold">Division</th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold">Department</th>
                  <th className="px-4 py-3 text-left font-semibold">Period</th>
                  <th className="px-4 py-3 text-center font-semibold">Employees</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={showDivisionFilter ? 9 : 8}
                      className="px-6 py-12 text-center text-stone-500 dark:text-stone-400"
                    >
                      <div className="flex justify-center items-center gap-2">
                        <Spinner />
                        Loading…
                      </div>
                    </td>
                  </tr>
                ) : batches.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showDivisionFilter ? 9 : 8}
                      className="px-6 py-12 text-center text-stone-500 dark:text-stone-400"
                    >
                      No batches found
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr
                      key={batch._id}
                      className="cursor-pointer border-b transition hover:bg-stone-50 dark:hover:bg-stone-900/40"
                      style={{ borderColor: "var(--ps-accent-border)" }}
                      onClick={() => router.push(`${detailBasePath}/${batch._id}`)}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          style={{ accentColor: "var(--ps-accent)" }}
                          checked={selectedIds.includes(String(batch._id))}
                          onChange={() => toggleSelectId(String(batch._id))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold" style={{ color: "var(--ps-accent)" }}>{batch.batchNumber}</div>
                        <div className="mt-0.5 text-xs text-stone-500">
                          By {batch.createdBy?.name || "Unknown"}
                        </div>
                      </td>
                      {showDivisionFilter && (
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-800 dark:text-stone-200">
                          {(batch.division as { name?: string })?.name || "N/A"}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-800 dark:text-stone-200">
                        {(batch.department as { name?: string })?.name || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-700 dark:text-stone-300">
                        {batch.monthName || batch.month}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">{batch.totalEmployees}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right ${ledgerMoneyClass()}`}>
                        {formatCurrency(batch.totalNetSalary)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <span className={ledgerStatusBadgeClass(batchLedgerStatus(batch.status))}>
                          {statusLabels[batch.status] || batch.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`${detailBasePath}/${batch._id}`}
                            className="p-2 text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {batch.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "approve")}
                              className="p-2 text-stone-400 hover:text-emerald-600"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          {batch.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "freeze")}
                              className="p-2 text-stone-400 hover:text-stone-800"
                            >
                              <Snowflake className="h-4 w-4" />
                            </button>
                          )}
                          {batch.status === "freeze" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "complete")}
                              className="p-2 text-stone-400 hover:text-emerald-600"
                            >
                              <CheckCheck className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div
            className="flex items-center justify-between border-t px-4 py-3"
            style={{ borderColor: "var(--ps-accent-border)" }}
          >
            <button
              type="button"
              className={loansDialogOutlineButtonClass()}
              style={loansDialogOutlineButtonStyle()}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-stone-600 dark:text-stone-400">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={loansDialogOutlineButtonClass()}
              style={loansDialogOutlineButtonStyle()}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </LoansContentPanel>
      )}

      {selectedIds.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 px-4 py-3 backdrop-blur-md dark:bg-stone-950/95 sm:ml-[240px]"
          style={{ borderColor: "var(--ps-accent-border)" }}
        >
          <div className="mx-auto flex max-w-[1920px] flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <div className="text-sm font-semibold text-stone-800 dark:text-stone-200">
              {selectedIds.length} batch(es) selected
              <button
                type="button"
                onClick={clearSelection}
                className="ml-3 text-xs font-semibold uppercase hover:underline"
                style={{ color: "var(--ps-accent)" }}
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!countEligible("approve")}
                onClick={() => openBulkAction("approve")}
                className={`px-3 py-2 text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-40 ${loansPrimaryButtonClass()}`}
                style={loansPrimaryButtonStyle()}
              >
                Approve ({countEligible("approve")})
              </button>
              <button
                type="button"
                disabled={!countEligible("freeze")}
                onClick={() => openBulkAction("freeze")}
                className={`px-3 py-2 text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-40 ${loansDialogOutlineButtonClass()}`}
                style={loansDialogOutlineButtonStyle()}
              >
                Freeze ({countEligible("freeze")})
              </button>
              <button
                type="button"
                disabled={!countEligible("complete")}
                onClick={() => openBulkAction("complete")}
                className={`px-3 py-2 text-xs font-semibold uppercase disabled:cursor-not-allowed disabled:opacity-40 ${loansPrimaryButtonClass()}`}
                style={loansPrimaryButtonStyle()}
              >
                Complete ({countEligible("complete")})
              </button>
            </div>
          </div>
        </div>
      )}

      <MissingPayrollWarningDialog
        open={missingPayrollWarningOpen}
        onClose={() => {
          setMissingPayrollWarningOpen(false);
          setPendingApproveBatchIds([]);
        }}
        issues={missingPayrollIssues}
        payRegisterBasePath={payRegisterBasePath}
        summary={missingPayrollSummary}
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
              {dialogMode === "single" && selectedBatch ? (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {actionType} batch for{" "}
                  <span className="font-medium text-stone-900 dark:text-stone-100">
                    {selectedBatch.department?.name}
                  </span>{" "}
                  ({selectedBatch.monthName || selectedBatch.month})?
                </p>
              ) : (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Apply <strong>{actionType}</strong> to{" "}
                  <strong>{batchesEligibleForAction(selectedBatchObjects, actionType).length}</strong> eligible
                  batch(es) from {selectedIds.length} selected.
                </p>
              )}
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

      <div className={selectedIds.length > 0 ? "pb-24" : ""} />
    </LoansPageShell>
  );
}
