"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { toast } from "react-toastify";
import { api, PayrollBatch, PayrollBatchStatus, Department, Division } from "@/lib/api";
import { auth } from "@/lib/auth";
import Spinner from "@/components/Spinner";

const statusColors: Record<PayrollBatchStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
    approved: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
    freeze: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
    complete: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
};

const statusLabels: Record<PayrollBatchStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    freeze: "Frozen",
    complete: "Completed"
};



export default function PaymentsPage() {
    const router = useRouter();
    const user = auth.getUser();
    const [batches, setBatches] = useState<PayrollBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);

    // Filters
    const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
    const [selectedDivision, setSelectedDivision] = useState<string>("");
    const [selectedDept, setSelectedDept] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Selected for bulk actions
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Action Dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [actionType, setActionType] = useState<'approve' | 'freeze' | 'complete' | null>(null);
    const [selectedBatch, setSelectedBatch] = useState<PayrollBatch | null>(null);
    const [actionReason, setActionReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    // Labels and Titles
    const actionLabels = {
        approve: "Approved",
        freeze: "Frozen",
        complete: "Completed"
    };

    const actionDialogTitle = {
        approve: "Approve Payroll Batch",
        freeze: "Freeze Payroll Batch",
        complete: "Mark Batch as Complete"
    };

    useEffect(() => {
        fetchDepartments();
        fetchDivisions();
    }, []);

    useEffect(() => {
        fetchBatches();
    }, [month, selectedDept, selectedDivision, selectedStatus, page]);

    const fetchDivisions = async () => {
        try {
            const response = await api.getDivisions();
            if (response.success && response.data) {
                setDivisions(response.data || []);
            }
        } catch (error) {
            console.error("Error fetching divisions:", error);
        }
    };

    const fetchDepartments = async () => {
        try {
            const response = await api.getDepartments();
            if (response.success && response.data) {
                setDepartments(response.data);
            }
        } catch (error) {
            console.error("Error fetching departments:", error);
        }
    };

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const params: any = {
                month,
                page,
                limit: 10
            };

            if (selectedDivision && selectedDivision !== "all") params.divisionId = selectedDivision;
            if (selectedDept !== "all") params.departmentId = selectedDept;
            if (selectedStatus !== "all") params.status = selectedStatus;

            const response = await api.getPayrollBatches(params);
            if (response.success && Array.isArray(response.data)) {
                setBatches(response.data);
                // Calculate total pages based on count and items per page (default 10)
                const itemsPerPage = params.limit || 10;
                const totalItems = response.count || response.data.length;
                setTotalPages(Math.ceil(totalItems / itemsPerPage) || 1);
            } else {
                setBatches([]);
                toast.error("Failed to load payroll batches");
            }
        } catch (error) {
            console.error("Error fetching batches:", error);
            toast.error("Failed to load payroll batches");
            setBatches([]);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (batch: PayrollBatch, action: 'approve' | 'freeze' | 'complete') => {
        setSelectedBatch(batch);
        setActionType(action);
        setOpenDialog(true);
        setActionReason("");
    };

    const handleActionConfirm = async () => {
        if (!selectedBatch || !actionType) return;

        try {
            setActionLoading(true);
            let response;

            switch (actionType) {
                case 'approve':
                    response = await api.approveBatch(selectedBatch._id, actionReason);
                    break;
                case 'freeze':
                    response = await api.freezeBatch(selectedBatch._id, actionReason);
                    break;
                case 'complete':
                    response = await api.completeBatch(selectedBatch._id, actionReason);
                    break;
            }

            if (response && response.success) {
                toast.success(`Batch ${actionLabels[actionType]} successfully`);
                setOpenDialog(false);
                fetchBatches(); // Refresh list
            } else {
                toast.error(response?.message || 'Action failed');
            }
        } catch (error: any) {
            console.error("Action error:", error);
            toast.error(error.message || 'Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    // Helper to get button color safely for Tailwind
    const getButtonColorClass = (type: 'approve' | 'freeze' | 'complete' | null) => {
        if (!type) return "bg-blue-600 hover:bg-blue-700 text-white";
        if (type === 'approve') return "bg-blue-500 hover:bg-blue-600 text-white";
        if (type === 'freeze') return "bg-purple-600 hover:bg-purple-700 text-white";
        if (type === 'complete') return "bg-green-600 hover:bg-green-700 text-white";
        return "bg-blue-600 hover:bg-blue-700 text-white";
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payroll Payments</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage monthly payroll batches and status</p>
                </div>
                <button
                    onClick={fetchBatches}
                    className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
                >
                    <RefreshIcon className="w-4 h-4 mr-2" />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full md:w-auto grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Month</label>
                            <input
                                type="month"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Division</label>
                            <select
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
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
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Department</label>
                            <select
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                                value={selectedDept}
                                onChange={(e) => setSelectedDept(e.target.value)}
                            >
                                <option value="all">All Departments</option>
                                {departments
                                    .filter(dept => {
                                        if (!selectedDivision || selectedDivision === "all") return true;
                                        const currentDiv = divisions.find(d => d._id === selectedDivision);
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
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
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
            </div>

            {/* Batches List */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Batch Info</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Division</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Period</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employees</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Net Salary</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        <div className="flex justify-center items-center">
                                            <Spinner />
                                            Loading batches...
                                        </div>
                                    </td>
                                </tr>
                            ) : batches.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                                                <SearchIcon className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <p className="font-medium">No payroll batches found</p>
                                            <p className="text-sm mt-1">Try adjusting your filters</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                batches.map((batch) => (
                                    <tr
                                        key={batch._id}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                                        onClick={() => router.push(`/superadmin/payments/${batch._id}`)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">{batch.batchNumber}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                By {batch.createdBy?.name || 'Unknown'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-900 dark:text-white font-medium">
                                                {(batch.division as any)?.name || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-900 dark:text-white font-medium">
                                                {(batch.department as any)?.name || 'Unknown Department'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-slate-900 dark:text-slate-200">{batch.monthName || batch.month}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                {batch.totalEmployees}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                {formatCurrency(batch.totalNetSalary)}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                                                Gross: {formatCurrency(batch.totalGrossSalary)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[batch.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                {statusLabels[batch.status] || batch.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <div className="flex justify-center items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                                <Link
                                                    href={`/superadmin/payments/${batch._id}`}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="View Details"
                                                >
                                                    <VisibilityIcon className="w-5 h-5" />
                                                </Link>

                                                {batch.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleStatusChange(batch, 'approve')}
                                                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="Approve"
                                                    >
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    </button>
                                                )}

                                                {batch.status === 'approved' && (
                                                    <button
                                                        onClick={() => handleStatusChange(batch, 'freeze')}
                                                        className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                        title="Freeze"
                                                    >
                                                        <AcUnitIcon className="w-5 h-5" />
                                                    </button>
                                                )}

                                                {batch.status === 'freeze' && (
                                                    <button
                                                        onClick={() => handleStatusChange(batch, 'complete')}
                                                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                        title="Mark as Complete"
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

                {/* Simple pagination */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                    <button
                        className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </button>
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Action Dialog - Fixed to avoid grey screen */}
            {
                openDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in border border-slate-100 dark:border-slate-700">
                            <div className="p-6">
                                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full mb-4">
                                    <CheckCircleIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>

                                <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
                                    {actionType && actionDialogTitle[actionType]}
                                </h3>

                                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
                                    Are you sure you want to <strong>{actionType}</strong> the payroll batch for
                                    <br />
                                    <span className="font-medium text-slate-900 dark:text-white">{selectedBatch?.department?.name}</span> ({selectedBatch?.monthName || selectedBatch?.month})?
                                </p>

                                <textarea
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4 min-h-[100px]"
                                    placeholder="Reason / Comments (Optional)"
                                    value={actionReason}
                                    onChange={(e) => setActionReason(e.target.value)}
                                ></textarea>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                        onClick={() => setOpenDialog(false)}
                                        disabled={actionLoading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-95 ${getButtonColorClass(actionType)} ${actionLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        onClick={handleActionConfirm}
                                        disabled={actionLoading}
                                    >
                                        {actionLoading ? 'Processing...' : 'Confirm'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// Icons Components
function RefreshIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}

function SearchIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}

function CheckCircleIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function VisibilityIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
}

function AcUnitIcon(props: any) {
    // Using a Snowflake-like icon
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m-9-9h18m-2.5-6.5l-13 13m13 0l-13-13" /></svg>;
}

function DoneAllIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" strokeOpacity="0.5" transform="translate(-3, 3)" /></svg>
}
