"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { api, PayrollBatch } from "@/lib/api";

const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
    approved: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
    freeze: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
    complete: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
};

export default function BatchDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const [batchId, setBatchId] = useState<string>(params.id as string);
    const [batch, setBatch] = useState<PayrollBatch | null>(null);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);

    // Action Dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [actionType, setActionType] = useState<'approve' | 'freeze' | 'complete' | 'unfreeze' | null>(null);
    const [actionReason, setActionReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [permissionActionLoading, setPermissionActionLoading] = useState(false);

    const actionLabels: Record<string, string> = {
        approve: "Approved",
        freeze: "Frozen",
        complete: "Completed",
        unfreeze: "Unfrozen"
    };

    const actionDialogTitle: Record<string, string> = {
        approve: "Approve Payroll Batch",
        freeze: "Freeze Payroll Batch",
        complete: "Mark Batch as Complete",
        unfreeze: "Unfreeze Batch (Revert to Approved)"
    };

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

    const handleStatusAction = (action: 'approve' | 'freeze' | 'complete' | 'unfreeze') => {
        setActionType(action);
        setOpenDialog(true);
        setActionReason("");
    };

    const handleActionConfirm = async () => {
        if (!batch || !actionType) return;

        try {
            setActionLoading(true);
            let response;

            switch (actionType) {
                case 'approve':
                case 'unfreeze': // Unfreeze uses the same approval endpoint/logic
                    response = await api.approveBatch(batch._id, actionReason);
                    break;
                case 'freeze':
                    response = await api.freezeBatch(batch._id, actionReason);
                    break;
                case 'complete':
                    response = await api.completeBatch(batch._id, actionReason);
                    break;
            }

            if (response && response.success) {
                toast.success(`Batch ${actionLabels[actionType]} successfully`);
                setOpenDialog(false);
                fetchBatchDetails(); // Refresh details
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

    const handleGrantPermission = async () => {
        if (!batch) return;
        try {
            setPermissionActionLoading(true);
            const response = await api.grantRecalculation(batch._id);
            if (response.success) {
                toast.success('Recalculation permission granted');
                fetchBatchDetails();
            } else {
                toast.error(response.message || 'Failed to grant permission');
            }
        } catch (error: any) {
            console.error('Error granting permission:', error);
            toast.error(error.message || 'Failed to grant permission');
        } finally {
            setPermissionActionLoading(false);
        }
    };



    const getButtonColorClass = (type: 'approve' | 'freeze' | 'complete' | 'unfreeze' | null) => {
        if (!type) return "bg-blue-600 hover:bg-blue-700 text-white";
        if (type === 'approve' || type === 'unfreeze') return "bg-blue-500 hover:bg-blue-600 text-white";
        if (type === 'freeze') return "bg-purple-600 hover:bg-purple-700 text-white";
        if (type === 'complete') return "bg-green-600 hover:bg-green-700 text-white";
        return "bg-blue-600 hover:bg-blue-700 text-white";
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20 min-h-[60vh]">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded-r-lg">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <WarningIcon className="h-5 w-5 text-red-400" />
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-red-700">
                                Batch not found or failed to load.
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none transition-colors"
                >
                    <ArrowBackIcon className="mr-2 h-4 w-4" />
                    Back to list
                </button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center">
                <button
                    onClick={() => router.back()}
                    className="mr-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <ArrowBackIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                </button>
                <div className="flex-grow">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{batch.batchNumber}</h1>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColors[batch.status] || 'bg-slate-100 text-slate-800'}`}>
                            {batch.status.toUpperCase()}
                        </span>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                        <span className="font-medium">{batch.department?.name}</span>
                        <span>•</span>
                        <span>{batch.monthName || batch.month}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {/* Header Actions */}
                    {batch.status === 'pending' && (
                        <button
                            onClick={() => handleStatusAction('approve')}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 shadow-sm transition-colors"
                        >
                            <CheckCircleIcon className="w-4 h-4 mr-2" />
                            Approve
                        </button>
                    )}
                    {batch.status === 'approved' && (
                        <button
                            onClick={() => handleStatusAction('freeze')}
                            className="inline-flex items-center px-4 py-2 bg-purple-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-purple-700 shadow-sm transition-colors"
                        >
                            <AcUnitIcon className="w-4 h-4 mr-2" />
                            Freeze
                        </button>
                    )}
                    {batch.status === 'freeze' && (
                        <>
                            <button
                                onClick={() => handleStatusAction('unfreeze')}
                                className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
                            >
                                <HistoryIcon className="w-4 h-4 mr-2" />
                                Unfreeze
                            </button>
                            <button
                                onClick={() => handleStatusAction('complete')}
                                className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-green-700 shadow-sm transition-colors"
                            >
                                <DoneAllIcon className="w-4 h-4 mr-2" />
                                Mark Complete
                            </button>
                        </>
                    )}

                    <button
                        onClick={fetchBatchDetails}
                        className="inline-flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
                    >
                        <RefreshIcon className="w-4 h-4 mr-2" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Recalculation Request Banner */}
            {batch.recalculationPermission?.requestedBy && !batch.recalculationPermission?.granted && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in shadow-sm">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-800/40 rounded-full text-amber-600 dark:text-amber-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Recalculation Requested</h3>
                            <p className="text-amber-700 dark:text-amber-300 mt-1 text-sm">
                                <strong>Request Reason:</strong> {batch.recalculationPermission.reason}
                            </p>
                            <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
                                Requested on {new Date(batch.recalculationPermission.requestedAt!).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={handleGrantPermission}
                            disabled={permissionActionLoading}
                            className="flex-1 md:flex-none px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
                        >
                            {permissionActionLoading ? 'Granting...' : 'Grant Permission'}
                        </button>
                    </div>
                </div>
            )
            }

            {/* Tabs */}
            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="-mb-px flex space-x-8">
                    {['Overview', `Employees (${batch.totalEmployees})`, 'History & Audit'].map((label, index) => (
                        <button
                            key={index}
                            onClick={() => setTabValue(index)}
                            className={`
                                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors outline-none
                                ${tabValue === index
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'}
                            `}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Overview Tab */}
            {
                tabValue === 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                        {/* Financial Summary */}
                        <div className="md:col-span-2 space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Gross</p>
                                    <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(batch.totalGrossSalary)}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Deductions</p>
                                    <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(batch.totalDeductions)}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Total Arrears</p>
                                    <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(batch.totalArrears)}</p>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl shadow-sm border border-green-200 dark:border-green-800">
                                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-1">Total Net Pay</p>
                                    <p className="text-xl font-bold text-green-800 dark:text-green-300">{formatCurrency(batch.totalNetSalary)}</p>
                                </div>
                            </div>

                            {/* Validation Status */}
                            {batch.validationStatus && !batch.validationStatus.allEmployeesCalculated && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-4 rounded-r-lg">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <WarningIcon className="h-5 w-5 text-yellow-400 dark:text-yellow-500" />
                                        </div>
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Validation Warning</h3>
                                            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-400">
                                                <p>Not all employees in this department have payroll calculated for this month.</p>
                                                {batch.validationStatus?.missingEmployees && batch.validationStatus.missingEmployees.length > 0 && (
                                                    <p className="mt-1 font-medium">
                                                        Missing: {batch.validationStatus.missingEmployees.length} employees
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar Actions & Info */}
                        <div className="md:col-span-1">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-700">Batch Information</h3>

                                <dl className="space-y-4 flex-grow">
                                    <div className="flex justify-between">
                                        <dt className="text-sm text-slate-500 dark:text-slate-400">Created By</dt>
                                        <dd className="text-sm font-medium text-slate-900 dark:text-slate-200 text-right">{batch.createdBy?.name || 'Unknown'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-sm text-slate-500 dark:text-slate-400">Created At</dt>
                                        <dd className="text-sm font-medium text-slate-900 dark:text-slate-200 text-right">{new Date(batch.createdAt).toLocaleDateString()}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-sm text-slate-500 dark:text-slate-400">Last Updated</dt>
                                        <dd className="text-sm font-medium text-slate-900 dark:text-slate-200 text-right">{new Date(batch.updatedAt).toLocaleDateString()}</dd>
                                    </div>
                                    {batch.approvedBy && (
                                        <div className="flex justify-between">
                                            <dt className="text-sm text-slate-500 dark:text-slate-400">Approved By</dt>
                                            <dd className="text-sm font-medium text-slate-900 dark:text-slate-200 text-right">{batch.approvedBy.name}</dd>
                                        </div>
                                    )}
                                </dl>

                                {/* Sidebar Action Buttons */}
                                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                                    {batch.status === 'pending' && (
                                        <button
                                            onClick={() => handleStatusAction('approve')}
                                            className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                        >
                                            <CheckCircleIcon className="w-4 h-4 mr-2" />
                                            Approve Batch
                                        </button>
                                    )}
                                    {batch.status === 'approved' && (
                                        <button
                                            onClick={() => handleStatusAction('freeze')}
                                            className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                                        >
                                            <AcUnitIcon className="w-4 h-4 mr-2" />
                                            Freeze Batch
                                        </button>
                                    )}
                                    {batch.status === 'freeze' && (
                                        <>
                                            <button
                                                onClick={() => handleStatusAction('complete')}
                                                className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                                            >
                                                <DoneAllIcon className="w-4 h-4 mr-2" />
                                                Mark as Complete
                                            </button>
                                            <button
                                                onClick={() => handleStatusAction('unfreeze')}
                                                className="w-full flex justify-center items-center px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none transition-colors"
                                            >
                                                <HistoryIcon className="w-4 h-4 mr-2" />
                                                Revert to Approved
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Employees Tab */}
            {
                tabValue === 1 && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                                        <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Basic Pay</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Allowances</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Gross</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deductions</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Arrears</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Net Salary</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {batch.employeePayrolls && batch.employeePayrolls.length > 0 ? (
                                        batch.employeePayrolls.map((empPayroll: any) => (
                                            <tr key={empPayroll._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                                                        {empPayroll.employeeId?.name || empPayroll.emp_no}
                                                    </div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                                        {empPayroll.emp_no}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900 dark:text-slate-200">
                                                    {formatCurrency(empPayroll.earnings?.basicPay || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900 dark:text-slate-200">
                                                    {formatCurrency(empPayroll.earnings?.totalAllowances || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-900 dark:text-slate-200">
                                                    {formatCurrency(empPayroll.earnings?.grossSalary || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 dark:text-red-400">
                                                    {formatCurrency(empPayroll.deductions?.totalDeductions || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-yellow-600 dark:text-yellow-400">
                                                    {formatCurrency(empPayroll.arrearsAmount || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatCurrency(empPayroll.netSalary || 0)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                                        {empPayroll.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                                                No employee payrolls found in this batch.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* History Tab */}
            {tabValue === 2 && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Batch Activity History</h3>
                    <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                        {[
                            ...(batch.statusHistory || []).map(h => ({ ...h, type: 'status_change', date: h.changedAt })),
                            ...(batch.recalculationHistory || []).map(h => ({ ...h, type: 'recalculation', date: h.recalculatedAt }))
                        ]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((item: any, index) => (
                                <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-50 dark:bg-slate-800 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                        {item.type === 'status_change' ? (
                                            <div className={`w-3 h-3 rounded-full ${statusColors[item.status] ? statusColors[item.status].split(' ')[0] : 'bg-slate-400'}`}></div>
                                        ) : (
                                            <RefreshIcon className="w-4 h-4 text-blue-500" />
                                        )}
                                    </div>
                                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                                        <div className="flex items-center justify-between space-x-2 mb-1">
                                            <div className="font-bold text-slate-900 dark:text-white">
                                                {item.type === 'status_change'
                                                    ? `Status changed to ${item.status.toUpperCase()}`
                                                    : 'Payroll Recalculated'}
                                            </div>
                                            <time className="font-caveat font-medium text-sm text-slate-500 dark:text-slate-400">
                                                {new Date(item.date).toLocaleString()}
                                            </time>
                                        </div>
                                        <div className="text-slate-500 dark:text-slate-400 text-sm">
                                            {item.type === 'status_change' ? (
                                                <p>Changed by <span className="font-medium text-slate-900 dark:text-slate-200">{item.changedBy?.name || 'Unknown'}</span></p>
                                            ) : (
                                                <p>Recalculated by <span className="font-medium text-slate-900 dark:text-slate-200">{item.recalculatedBy?.name || 'Unknown'}</span></p>
                                            )}

                                            {item.reason && (
                                                <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-900/50 p-2 rounded text-slate-600 dark:text-slate-300 italic border border-slate-100 dark:border-slate-800">
                                                    "{item.reason}"
                                                </div>
                                            )}

                                            {item.type === 'recalculation' && item.previousSnapshot && (
                                                <div className="mt-3 text-xs">
                                                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Snapshot Summary:</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>Prev Net: {formatCurrency(item.previousSnapshot.totalNetSalary)}</div>
                                                        <div>Prev Gross: {formatCurrency(item.previousSnapshot.totalGrossSalary)}</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                        {(!batch.statusHistory?.length && !batch.recalculationHistory?.length) && (
                            <div className="text-center py-10 text-slate-500">No activity history found.</div>
                        )}
                    </div>
                </div>
            )}
            {/* Action Dialog - Fixed to avoid grey screen */}
            {
                openDialog && actionType && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in border border-slate-100 dark:border-slate-700">
                            <div className="p-6">
                                <div className={`flex items-center justify-center w-12 h-12 mx-auto rounded-full mb-4 ${actionType === 'approve' ? 'bg-blue-100 dark:bg-blue-900/30' :
                                    actionType === 'freeze' ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-green-100 dark:bg-green-900/30'
                                    }`}>
                                    {actionType === 'approve' && <CheckCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />}
                                    {actionType === 'freeze' && <AcUnitIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />}
                                    {actionType === 'complete' && <DoneAllIcon className="h-6 w-6 text-green-600 dark:text-green-400" />}
                                </div>

                                <h3 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
                                    {actionDialogTitle[actionType]}
                                </h3>

                                <div className="mt-2">
                                    <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
                                        Are you sure you want to <strong>{actionType}</strong> this payroll batch?
                                    </p>

                                    <textarea
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4 min-h-[100px]"
                                        placeholder="Reason / Comments (Optional)"
                                        value={actionReason}
                                        onChange={(e) => setActionReason(e.target.value)}
                                    ></textarea>

                                    {/* Notice Alerts */}
                                    {actionType === 'approve' && (
                                        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500 p-3 rounded-r">
                                            <div className="flex">
                                                <div className="ml-1">
                                                    <p className="text-xs text-blue-700 dark:text-blue-300">
                                                        Note: This will lock the batch for recalculation unless permission is granted.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {actionType === 'complete' && (
                                        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-3 rounded-r">
                                            <div className="flex">
                                                <div className="ml-1">
                                                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                                        Processing payroll is final. Ensure all data is correct.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-6">
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
                    </div>
                )
            }
        </div >
    );
}

// Icon Components
function ArrowBackIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
}

function RefreshIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}

function CheckCircleIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function WarningIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
}

function AcUnitIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m-9-9h18m-2.5-6.5l-13 13m13 0l-13-13" /></svg>;
}

function DoneAllIcon(props: any) {
    return <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" strokeOpacity="0.5" transform="translate(-3, 3)" /></svg>
}

function HistoryIcon(props: any) {
    return (
        <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
}
