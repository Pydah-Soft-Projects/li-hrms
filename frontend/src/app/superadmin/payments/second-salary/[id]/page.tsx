'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
    ArrowLeft,
    Banknote,
    Calendar,
    Users,
    Loader2,
    CheckCircle2,
    Clock,
    Building2,
    Search,
    Download,
    User,
    Check
} from 'lucide-react';
import Link from 'next/link';

/**
 * Render a detailed view for a second-salary batch, including batch header, status actions, summary cards, and a searchable employee breakdown table.
 *
 * The component fetches batch data for the current route `id` and provides UI controls to change the batch status.
 *
 * @returns A React element that displays batch details, action buttons for status updates, summary metrics, and a searchable list of employee payroll records.
 */
export default function SecondSalaryBatchDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [batch, setBatch] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    useEffect(() => {
        fetchBatchDetails();
    }, [id]);

    const fetchBatchDetails = async () => {
        setIsLoading(true);
        try {
            const res = await api.get(`/second-salary/batches/${id}`);
            if (res.success) {
                setBatch(res.data);
            }
        } catch (error) {
            console.error('Error fetching batch details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (status: string) => {
        if (!confirm(`Are you sure you want to change status to ${status}?`)) return;

        setIsUpdatingStatus(true);
        try {
            const res = await api.put(`/second-salary/batches/${id}/status`, { status });
            if (res.success) {
                setBatch(res.data);
                alert(`Batch ${status} successfully`);
            }
        } catch (error: any) {
            alert(error.message || 'Failed to update status');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="mt-4 text-slate-500 font-medium tracking-tight">Loading batch details...</p>
            </div>
        );
    }

    if (!batch) {
        return (
            <div className="text-center py-20">
                <p className="text-slate-500">Batch not found</p>
                <Link href="/superadmin/payments/second-salary" className="text-indigo-600 mt-2 inline-block">Back to list</Link>
            </div>
        );
    }

    const filteredRecords = batch.employeePayrolls?.filter((record: any) =>
        record.employeeId?.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.emp_no?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
            {/* Breadcrumbs & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.back()}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-500" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{batch.batchNumber}</h1>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                ${batch.status === 'complete' ? 'bg-emerald-100 text-emerald-800' :
                                    batch.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                        'bg-slate-100 text-slate-800'}`}
                            >
                                {batch.status}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 flex items-center gap-2 mt-1 font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            {batch.monthName || batch.month} • {batch.department?.name}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {batch.status === 'pending' && (
                        <button
                            onClick={() => handleUpdateStatus('approved')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" /> Approve Batch
                        </button>
                    )}
                    {batch.status === 'approved' && (
                        <button
                            onClick={() => handleUpdateStatus('complete')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                        >
                            <CheckCircle2 className="w-4 h-4" /> Complete Batch
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Employees</p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white">{batch.totalEmployees}</span>
                        <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Net Salary</p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-2xl font-bold text-emerald-600">{formatCurrency(batch.totalNetSalary)}</span>
                        <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600">
                            <Banknote className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Division</p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{batch.division?.name || 'N/A'}</span>
                        <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Building2 className="w-5 h-5" />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created Date</p>
                    <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{new Date(batch.createdAt).toLocaleDateString()}</span>
                        <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                            <Clock className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Records Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Employee Breakdown</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search employee..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Emp No</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">2nd Salary Amount</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Net Salary</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredRecords.map((record: any) => (
                                <tr key={record._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs uppercase">
                                                {record.employeeId?.employee_name?.[0] || 'E'}
                                            </div>
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {record.employeeId?.employee_name || 'Unknown'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                                        {record.emp_no}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {formatCurrency(record.earnings?.secondSalaryAmount || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-900 dark:text-white">
                                        {formatCurrency(record.netSalary || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                                            {record.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}