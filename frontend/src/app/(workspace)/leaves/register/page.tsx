'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Users,
    Search,
    Download,
    Info,
    Calendar,
    Layers,
    FileText,
    Loader2
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface LeaveRegisterEntry {
    employee: {
        id: string;
        name: string;
        emp_no: string;
        division: string;
        department: string;
    };
    casualLeave: {
        carryForward: number;
        accruedThisMonth: number;
        earnedCCL: number;
        usedThisMonth: number;
        totalUsedInFY: number;
        balance: number;
        maxUsageLimit: number;
    };
    earnedLeave: {
        balance: number;
    };
    compensatoryOff: {
        balance: number;
    };
    totalPaidBalance: number;
}

export default function LeaveRegisterPage() {
    const { } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<LeaveRegisterEntry[]>([]);
    const [divisions, setDivisions] = useState<any[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [filters, setFilters] = useState({
        divisionId: '',
        departmentId: '',
        searchTerm: '',
        month: new Date().toISOString().substring(0, 7) // YYYY-MM
    });

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        fetchRegister();
    }, [filters.divisionId, filters.departmentId, filters.month]);

    const loadInitialData = async () => {
        try {
            const [divRes, deptRes] = await Promise.all([
                api.getDivisions(),
                api.getDepartments()
            ]);
            setDivisions(divRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    };

    const fetchRegister = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getLeaveRegister(filters);
            setData(res.data || []);
        } catch (error) {
            console.error('Error fetching register:', error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const totals = data.reduce((acc, curr) => ({
        clBalance: acc.clBalance + curr.casualLeave.balance,
        elBalance: acc.elBalance + curr.earnedLeave.balance,
        cclBalance: acc.cclBalance + curr.compensatoryOff.balance,
        totalBalance: acc.totalBalance + curr.totalPaidBalance
    }), { clBalance: 0, elBalance: 0, cclBalance: 0, totalBalance: 0 });

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 dark:bg-slate-900/50 p-4 md:p-6 lg:p-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-7 h-7 text-green-600" />
                        Clear Leave Register
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Aggregated monthly leave entitlements and usage tracking
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                        onClick={() => {/* Export Logic */ }}
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Filters Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search employee..."
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all dark:text-white"
                            value={filters.searchTerm}
                            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && fetchRegister()}
                        />
                    </div>

                    {/* Month Picker */}
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="month"
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all dark:text-white"
                            value={filters.month}
                            onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value }))}
                        />
                    </div>

                    {/* Division */}
                    <div className="relative">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all dark:text-white appearance-none"
                            value={filters.divisionId}
                            onChange={(e) => setFilters(prev => ({ ...prev, divisionId: e.target.value, departmentId: '' }))}
                        >
                            <option value="">All Divisions</option>
                            {divisions.map(div => (
                                <option key={div._id} value={div._id}>{div.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Department */}
                    <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all dark:text-white appearance-none"
                            value={filters.departmentId}
                            onChange={(e) => setFilters(prev => ({ ...prev, departmentId: e.target.value }))}
                        >
                            <option value="">All Departments</option>
                            {departments
                                .filter(dept => !filters.divisionId || dept.division_id === filters.divisionId)
                                .map(dept => (
                                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                                ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content Table */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse min-w-[1200px]">
                    <thead>
                        {/* Header Level 1 - Grouping */}
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                            <th colSpan={3} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center">
                                Employee Information
                            </th>
                            <th colSpan={5} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center bg-green-50/30 dark:bg-green-900/10">
                                Casual Leave (CL) Pool
                            </th>
                            <th colSpan={1} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center">
                                CCL
                            </th>
                            <th colSpan={1} className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center">
                                EL
                            </th>
                            <th colSpan={1} className="px-4 py-3 font-semibold text-slate-900 dark:text-white text-center bg-blue-50/30 dark:bg-blue-900/10">
                                Total Status
                            </th>
                        </tr>
                        {/* Header Level 2 - Detailed Columns */}
                        <tr className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <th className="px-4 py-2 font-medium border-r border-slate-200 dark:border-slate-700">Emp ID</th>
                            <th className="px-4 py-2 font-medium border-r border-slate-200 dark:border-slate-700">Name</th>
                            <th className="px-4 py-2 font-medium border-r border-slate-200 dark:border-slate-700">Dept</th>

                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 bg-green-50/20 dark:bg-green-900/5">C/F</th>
                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 bg-green-50/20 dark:bg-green-900/5">Accrued</th>
                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 bg-green-50/20 dark:bg-green-900/5">Earned (CCL)</th>
                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700 bg-green-50/20 dark:bg-green-900/5">Used</th>
                            <th className="px-4 py-2 font-bold text-center border-r border-slate-200 dark:border-slate-700 bg-green-100/50 dark:bg-green-900/20 text-green-700 dark:text-green-400">Net CL Bal</th>

                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700">Bal</th>
                            <th className="px-4 py-2 font-medium text-center border-r border-slate-200 dark:border-slate-700">Bal</th>

                            <th className="px-4 py-2 font-bold text-center bg-blue-100/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">Closing Paid Bal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {loading ? (
                            <tr>
                                <td colSpan={11} className="px-4 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
                                        <span className="text-slate-500 animate-pulse">Calculating register data...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={11} className="px-4 py-20 text-center italic text-slate-400">
                                    No records found for the selected month/filters.
                                </td>
                            </tr>
                        ) : data.map((entry) => (
                            <tr key={entry.employee.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors group">
                                <td className="px-4 py-3 font-mono text-xs border-r border-slate-200 dark:border-slate-700">{entry.employee.emp_no}</td>
                                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700">{entry.employee.name}</td>
                                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">{entry.employee.department}</td>

                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 bg-green-50/10 dark:bg-green-900/5">{entry.casualLeave.carryForward.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 bg-green-50/10 dark:bg-green-900/5">{entry.casualLeave.accruedThisMonth.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 bg-green-50/10 dark:bg-green-900/5">{entry.casualLeave.earnedCCL}</td>
                                <td className="px-4 py-3 text-center text-red-600 dark:text-red-400 font-medium border-r border-slate-200 dark:border-slate-700 bg-green-50/10 dark:bg-green-900/5">
                                    {entry.casualLeave.usedThisMonth}
                                    {entry.casualLeave.maxUsageLimit > 0 && (
                                        <span className="text-[10px] text-slate-400 ml-1">/ {entry.casualLeave.maxUsageLimit}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-green-700 dark:text-green-400 border-r border-slate-200 dark:border-slate-700 bg-green-100/20 dark:bg-green-900/10">{entry.casualLeave.balance.toFixed(2)}</td>

                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">{entry.compensatoryOff.balance}</td>
                                <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700">{entry.earnedLeave.balance}</td>

                                <td className="px-4 py-3 text-center font-bold text-blue-700 dark:text-blue-400 bg-blue-100/20 dark:bg-blue-900/10 text-base">{entry.totalPaidBalance.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    {/* Footer - Totals */}
                    {!loading && data.length > 0 && (
                        <tfoot className="bg-slate-100/80 dark:bg-slate-900/80 font-bold">
                            <tr>
                                <td colSpan={3} className="px-4 py-3 text-right">TOTAL POOL:</td>
                                <td colSpan={4} className="border-r border-slate-200 dark:border-slate-700"></td>
                                <td className="px-4 py-3 text-center text-green-700 dark:text-green-400 border-r border-slate-200 dark:border-slate-700">{totals.clBalance.toFixed(1)}</td>
                                <td className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-700">{totals.cclBalance}</td>
                                <td className="px-4 py-3 text-center border-r border-slate-200 dark:border-slate-700">{totals.elBalance}</td>
                                <td className="px-4 py-3 text-center text-blue-700 dark:text-blue-400 text-lg">{totals.totalBalance.toFixed(1)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Footer Info */}
            <div className="mt-6 flex items-start gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1 text-blue-800 dark:text-blue-300">
                    <p><strong>Note 1:</strong> Casual Leave (CL) pool is accrued monthly (Yearly Entitlement / 12). Unused CL is carried forward within the financial year.</p>
                    <p><strong>Note 2:</strong> Compensatory Casual Leave (earned from Sunday/Holiday work) is automatically added to the CL pool as &quot;Earned (CCL)&quot;.</p>
                    <p><strong>Note 3:</strong> Total Paid Balance = (Net CL Available) + (Compensatory Off Balance) + (Earned Leave Balance).</p>
                </div>
            </div>
        </div>
    );
}
