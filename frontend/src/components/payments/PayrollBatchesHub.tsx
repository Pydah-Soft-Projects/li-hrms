"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "react-toastify";
import { api, PayrollBatch, PayrollBatchStatus, Department, Division } from "@/lib/api";
import Spinner from "@/components/Spinner";
import {
  groupBatchesForUi,
  batchesEligibleForAction,
  type DivisionGroup,
} from "@/components/payments/payrollBatchUtils";

const statusColors: Record<PayrollBatchStatus, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  approved:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  freeze:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  complete:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
};

const statusLabels: Record<PayrollBatchStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  freeze: "Frozen",
  complete: "Completed",
};

export type PayrollBatchesHubProps = {
  detailBasePath: string;
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

export default function PayrollBatchesHub({ detailBasePath, showDivisionFilter = false }: PayrollBatchesHubProps) {
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

  const getButtonColorClass = (type: "approve" | "freeze" | "complete" | null) => {
    if (!type) return "bg-blue-600 hover:bg-blue-700 text-white";
    if (type === "approve") return "bg-blue-500 hover:bg-blue-600 text-white";
    if (type === "freeze") return "bg-purple-600 hover:bg-purple-700 text-white";
    if (type === "complete") return "bg-green-600 hover:bg-green-700 text-white";
    return "bg-blue-600 hover:bg-blue-700 text-white";
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

  const handleActionConfirm = async () => {
    if (!actionType) return;

    try {
      setActionLoading(true);
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
        toast.success(response.message || `Bulk ${actionLabels[actionType].toLowerCase()}`);
        const errs = response.errors as { batchId: string; error: string }[] | undefined;
        if (errs?.length) {
          toast.error(`${errs.length} batch(es) failed. First: ${errs[0].error}`);
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

  const countEligible = (action: "approve" | "freeze" | "complete") =>
    batchesEligibleForAction(selectedBatchObjects, action).length;

  const filterClass =
       "w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-28">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payroll Payments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage monthly payroll batches — group by division and apply bulk status updates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-100/80 dark:bg-slate-900/50">
            <button
              type="button"
              onClick={() => setViewMode("by-division")}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                viewMode === "by-division"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              By division
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                viewMode === "table"
                  ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Table
            </button>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
          >
            <RefreshIcon className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Month</label>
              <input
                type="month"
                className={filterClass}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            {showDivisionFilter && (
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Division</label>
                <select
                  className={`${filterClass} cursor-pointer`}
                  value={selectedDivision}
                  onChange={(e) => {
                    setSelectedDivision(e.target.value);
                    setSelectedDept("all");
                  }}
                >
                  <option value="">All Divisions</option>
                  {divisions.map((div) => (
                    <option key={div._id} value={div._id}>
                      {div.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Department</label>
              <select
                className={`${filterClass} cursor-pointer`}
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="all">All Departments</option>
                {departments
                  .filter((dept) => {
                    if (!showDivisionFilter || !selectedDivision || selectedDivision === "all") return true;
                    const currentDiv = divisions.find((d) => d._id === selectedDivision);
                    return currentDiv?.departments?.some((d: any) => d === dept._id || d._id === dept._id);
                  })
                  .map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Status</label>
              <select
                className={`${filterClass} cursor-pointer`}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="freeze">Frozen</option>
                <option value="complete">Completed</option>
              </select>
            </div>
          </div>
        </div>
        {viewMode === "by-division" && groupLoadMeta && (
          <p className="text-[11px] text-slate-400 mt-3">
            Loaded {groupLoadMeta.loaded} batch(es)
            {groupLoadMeta.total > groupLoadMeta.loaded ? ` (server total ${groupLoadMeta.total})` : ""} for this filter.
          </p>
        )}
      </div>

      {viewMode === "by-division" ? (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-20 text-slate-500 gap-3">
              <Spinner />
              Loading batches…
            </div>
          ) : groupedStructure.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 py-16 text-center text-slate-500">
              <SearchIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" />
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
                  className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
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
                    className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left px-5 py-4 bg-slate-50/80 dark:bg-slate-900/40 hover:bg-slate-100/80 dark:hover:bg-slate-900/70 transition cursor-pointer"
                  >
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">{div.label}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {div.batches.length} batch(es) · Net {formatCurrency(totalNet)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        P {pending}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        A {approved}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        F {frozen}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        C {done}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => selectAllInDivision(div, e)}
                        className="ml-2 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-slate-400 text-sm ml-1">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                      {div.departments.map((dep) => (
                        <div key={dep.deptId} className="px-4 py-3 bg-white dark:bg-slate-800/80">
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 pl-1">
                            {dep.deptName}
                          </h3>
                          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50/90 dark:bg-slate-900/50 text-[10px] uppercase text-slate-500">
                                  <th className="w-10 py-2 pl-3 text-left"></th>
                                  <th className="px-3 py-2 text-left">Batch</th>
                                  <th className="px-3 py-2 text-left">Period</th>
                                  <th className="px-3 py-2 text-center">Emp</th>
                                  <th className="px-3 py-2 text-right">Net</th>
                                  <th className="px-3 py-2 text-center">Status</th>
                                  <th className="px-3 py-2 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {dep.batches.map((batch) => (
                                  <tr
                                    key={batch._id}
                                    className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 cursor-pointer"
                                    onClick={() => router.push(`${detailBasePath}/${batch._id}`)}
                                  >
                                    <td className="py-2 pl-3" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        className="rounded border-slate-300 dark:border-slate-600"
                                        checked={selectedIds.includes(String(batch._id))}
                                        onChange={() => toggleSelectId(String(batch._id))}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                      {batch.batchNumber}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                      {batch.monthName || batch.month}
                                    </td>
                                    <td className="px-3 py-2 text-center">{batch.totalEmployees}</td>
                                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                                      {formatCurrency(batch.totalNetSalary)}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span
                                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                          statusColors[batch.status] ||
                                          "bg-slate-100 text-slate-600 border-slate-200"
                                        }`}
                                      >
                                        {statusLabels[batch.status] || batch.status}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex justify-center gap-0.5">
                                        <Link
                                          href={`${detailBasePath}/${batch._id}`}
                                          className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg"
                                          title="View"
                                        >
                                          <VisibilityIcon className="w-4 h-4" />
                                        </Link>
                                        {batch.status === "pending" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "approve")}
                                            className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg"
                                            title="Approve"
                                          >
                                            <CheckCircleIcon className="w-4 h-4" />
                                          </button>
                                        )}
                                        {batch.status === "approved" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "freeze")}
                                            className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg"
                                            title="Freeze"
                                          >
                                            <AcUnitIcon className="w-4 h-4" />
                                          </button>
                                        )}
                                        {batch.status === "freeze" && (
                                          <button
                                            type="button"
                                            onClick={() => openSingleAction(batch, "complete")}
                                            className="p-1.5 text-slate-400 hover:text-green-600 rounded-lg"
                                            title="Complete"
                                          >
                                            <DoneAllIcon className="w-4 h-4" />
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="w-10 px-3 py-4"></th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Batch Info
                  </th>
                  {showDivisionFilter && (
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Division
                    </th>
                  )}
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Employees
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Net
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td
                      colSpan={showDivisionFilter ? 9 : 8}
                      className="px-6 py-12 text-center text-slate-500 dark:text-slate-400"
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
                      className="px-6 py-12 text-center text-slate-500 dark:text-slate-400"
                    >
                      No batches found
                    </td>
                  </tr>
                ) : (
                  batches.map((batch) => (
                    <tr
                      key={batch._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`${detailBasePath}/${batch._id}`)}
                    >
                      <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-slate-600"
                          checked={selectedIds.includes(String(batch._id))}
                          onChange={() => toggleSelectId(String(batch._id))}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">{batch.batchNumber}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          By {batch.createdBy?.name || "Unknown"}
                        </div>
                      </td>
                      {showDivisionFilter && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white font-medium">
                          {(batch.division as any)?.name || "N/A"}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white font-medium">
                        {(batch.department as any)?.name || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-200">
                        {batch.monthName || batch.month}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {batch.totalEmployees}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-slate-900 dark:text-white">
                        {formatCurrency(batch.totalNetSalary)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                            statusColors[batch.status] || "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {statusLabels[batch.status] || batch.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center items-center space-x-1">
                          <Link
                            href={`${detailBasePath}/${batch._id}`}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          >
                            <VisibilityIcon className="w-5 h-5" />
                          </Link>
                          {batch.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "approve")}
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                            >
                              <CheckCircleIcon className="w-5 h-5" />
                            </button>
                          )}
                          {batch.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "freeze")}
                              className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                            >
                              <AcUnitIcon className="w-5 h-5" />
                            </button>
                          )}
                          {batch.status === "freeze" && (
                            <button
                              type="button"
                              onClick={() => openSingleAction(batch, "complete")}
                              className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                            >
                              <DoneAllIcon className="w-5 h-5" />
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
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <button
              type="button"
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {selectedIds.length} batch(es) selected
              <button type="button" onClick={clearSelection} className="ml-3 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase hover:underline">
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!countEligible("approve")}
                onClick={() => openBulkAction("approve")}
                className="px-3 py-2 rounded-xl text-xs font-bold uppercase bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Approve ({countEligible("approve")})
              </button>
              <button
                type="button"
                disabled={!countEligible("freeze")}
                onClick={() => openBulkAction("freeze")}
                className="px-3 py-2 rounded-xl text-xs font-bold uppercase bg-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Freeze ({countEligible("freeze")})
              </button>
              <button
                type="button"
                disabled={!countEligible("complete")}
                onClick={() => openBulkAction("complete")}
                className="px-3 py-2 rounded-xl text-xs font-bold uppercase bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Complete ({countEligible("complete")})
              </button>
            </div>
          </div>
        </div>
      )}

      {openDialog && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-700">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                <CheckCircleIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
                {actionDialogTitle[actionType]}
              </h3>
              {dialogMode === "single" && selectedBatch ? (
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-4">
                  {actionType} batch for{" "}
                  <span className="font-medium text-slate-900 dark:text-white">
                    {selectedBatch.department?.name}
                  </span>{" "}
                  ({selectedBatch.monthName || selectedBatch.month})?
                </p>
              ) : (
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-2">
                  Apply <strong>{actionType}</strong> to{" "}
                  <strong>{batchesEligibleForAction(selectedBatchObjects, actionType).length}</strong> eligible batch(es)
                  from {selectedIds.length} selected.
                </p>
              )}
              <textarea
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4 min-h-[100px]"
                placeholder="Reason / comments (optional)"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 font-medium"
                  onClick={() => setOpenDialog(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-white ${getButtonColorClass(actionType)} ${
                    actionLoading ? "opacity-70" : ""
                  }`}
                  onClick={handleActionConfirm}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Processing…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function CheckCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function VisibilityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function AcUnitIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m-9-9h18m-2.5-6.5l-13 13m13 0l-13-13" />
    </svg>
  );
}

function DoneAllIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
        strokeOpacity="0.5"
        transform="translate(-3, 3)"
      />
    </svg>
  );
}
