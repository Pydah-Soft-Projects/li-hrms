'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
    FileText,
    Download,
    Eye,
    AlertCircle,
    Calendar,
    Hash,
    CheckCircle2,
    Clock,
    ArrowRight,
    TrendingUp,
    CreditCard,
    Building2,
    User as UserIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

const PayslipsPage = () => {
    const { user } = useAuth();
    const [payslips, setPayslips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState({
        totalEarned: 0,
        totalDeductions: 0,
        netPay: 0,
        lastMonth: ''
    });

    useEffect(() => {
        loadPayslips();
    }, []);

    const loadPayslips = async () => {
        try {
            setLoading(true);
            setError(null);

            // getPayrollRecords handles role-based filtering and history settings on backend
            const response = await api.get('/payroll/records');

            if (response.data.success) {
                setPayslips(response.data.data);
                calculateStats(response.data.data);
            } else {
                setError(response.data.message || 'Failed to load payslips');
            }
        } catch (err) {
            console.error('Error loading payslips:', err);
            setError(err.response?.data?.message || 'Error connecting to server');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data) => {
        if (!data || data.length === 0) return;

        const latest = data[0];
        const totalEarned = data.reduce((acc, curr) => acc + (curr.totalEarnings || 0), 0);
        const netPayTotal = data.reduce((acc, curr) => acc + (curr.netSalary || 0), 0);

        setStats({
            totalEarned: totalEarned,
            totalDeductions: totalEarned - netPayTotal,
            netPay: latest.netSalary || 0,
            lastMonth: latest.month || ''
        });
    };

    const handleDownload = async (record) => {
        try {
            toast.loading('Preparing payslip...', { id: 'download' });

            const employeeId = record.employee_id?._id || record.employee_id;
            const month = record.month;

            // Use the new downloadPayslip endpoint
            const response = await api.get(`/payroll/download/${employeeId}/${month}`, {
                responseType: 'blob'
            });

            // Create a link to download the file
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Payslip_${month}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();

            toast.success('Payslip downloaded successfully!', { id: 'download' });

            // Refresh to update download count
            loadPayslips();
        } catch (err) {
            console.error('Download error:', err);
            const message = err.response?.data?.message || 'Download limit reached or file unavailable';
            toast.error(message, { id: 'download' });
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-500 font-medium animate-pulse">Loading your payslips...</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financial Records</h1>
                    <p className="text-slate-500 text-lg">Manage and download your monthly payslips</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-semibold border border-blue-100">
                    <Hash className="w-4 h-4" />
                    Emp ID: {user?.employeeId || 'N/A'}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-200/50 hover:scale-[1.02] transition-transform duration-300">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-lg opacity-90">Net Salary</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-4xl font-bold">₹{stats.netPay.toLocaleString()}</h3>
                        <p className="text-white/70 flex items-center gap-1 text-sm font-medium">
                            <Calendar className="w-3 h-3" />
                            Latest: {stats.lastMonth}
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <FileText className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-lg text-slate-600">Total Arrears</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-4xl font-bold text-slate-900">₹{stats.totalEarned.toLocaleString()}</h3>
                        <p className="text-slate-400 flex items-center gap-1 text-sm font-medium">
                            Cumulative earnings this period
                        </p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors duration-300">
                            <Clock className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-lg text-slate-600">Pending Actions</span>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-4xl font-bold text-slate-900">{0}</h3>
                        <p className="text-slate-400 flex items-center gap-1 text-sm font-medium">
                            Requests awaiting approval
                        </p>
                    </div>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-start gap-4 text-rose-700">
                    <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="font-bold text-lg">Something went wrong</p>
                        <p className="opacity-90">{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Payslip History
                    </h2>
                    <div className="text-sm font-medium text-slate-500">
                        Showing last {payslips.length} months
                    </div>
                </div>

                {payslips.length === 0 && !error ? (
                    <div className="p-16 text-center space-y-4">
                        <div className="inline-flex p-6 bg-slate-50 rounded-full text-slate-300">
                            <FileText className="w-16 h-16" />
                        </div>
                        <div className="max-w-xs mx-auto space-y-1">
                            <p className="text-xl font-bold text-slate-600">No payslips found</p>
                            <p className="text-slate-400">Your records will appear here once payroll is processed and released.</p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {payslips.map((record) => (
                            <div
                                key={record._id}
                                className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-slate-50/50 transition-colors group"
                            >
                                <div className="flex items-center gap-6">
                                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                                        <span className="text-xs font-bold uppercase tracking-wider">{record.month?.split(' ')[0]?.substring(0, 3)}</span>
                                        <span className="text-xl font-black">{record.month?.split(' ')[1]}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                            {record.month}
                                            {record.isReleased ? (
                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-tighter flex items-center gap-0.5 border border-emerald-200">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Released
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full uppercase tracking-tighter flex items-center gap-0.5 border border-slate-200">
                                                    <Clock className="w-3 h-3" />
                                                    Pending
                                                </span>
                                            )}
                                        </h4>
                                        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-slate-500 font-medium">
                                            <span className="flex items-center gap-1.5">
                                                <CreditCard className="w-4 h-4 opacity-70" />
                                                Net: ₹{record.netSalary?.toLocaleString()}
                                            </span>
                                            <span className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></span>
                                            <span className="flex items-center gap-1.5">
                                                <Download className="w-4 h-4 opacity-70" />
                                                Downloads: {record.downloadCount || 0}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-slate-100 text-slate-600 font-bold rounded-2xl hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50 transition-all duration-300 active:scale-95 group/btn"
                                        onClick={() => toast.success('Viewing feature coming soon!')}
                                    >
                                        <Eye className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                        <span>View</span>
                                    </button>
                                    <button
                                        disabled={!record.isReleased}
                                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 font-bold rounded-2xl transition-all duration-300 active:scale-95 group/btn shadow-lg shadow-blue-200/50 
                      ${record.isReleased
                                                ? 'bg-blue-600 text-white hover:bg-blue-700 hover:translate-y-[-2px]'
                                                : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                            }`}
                                        onClick={() => handleDownload(record)}
                                    >
                                        <Download className="w-5 h-5 group-hover/btn:animate-bounce" />
                                        <span>Download</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Information Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8 text-sm">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        Payroll Guidelines
                    </div>
                    <ul className="space-y-3 text-slate-600 font-medium">
                        <li className="flex items-start gap-3">
                            <div className="w-5 h-5 bg-white rounded-full border border-slate-200 flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</div>
                            Payslips are typically released by the 5th of every month.
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-5 h-5 bg-white rounded-full border border-slate-200 flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</div>
                            A download limit may apply per payslip to ensure document security.
                        </li>
                        <li className="flex items-start gap-3">
                            <div className="w-5 h-5 bg-white rounded-full border border-slate-200 flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</div>
                            In case of discrepancies, please contact the HR department immediately.
                        </li>
                    </ul>
                </div>

                <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100 flex flex-col justify-between">
                    <div className="space-y-2">
                        <h4 className="font-bold text-blue-900">Need Assistance?</h4>
                        <p className="text-blue-700/80 leading-relaxed font-medium">
                            If you're unable to find a specific month's payslip or encounter issues with downloads,
                            our HR support team is here to help you resolve it.
                        </p>
                    </div>
                    <button className="mt-6 flex items-center gap-2 font-bold text-blue-600 hover:text-blue-700 transition-colors py-2">
                        Contact HR Support
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PayslipsPage;
