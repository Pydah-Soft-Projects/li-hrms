'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Department, Division, Employee } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import {
    Search,
    Download,
    Loader2,
    LayoutGrid,
    List,
    ChevronRight,
    Filter,
    X,
    Wallet,
    Undo2,
    PieChart,
    TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import LoanDetailsModal from './loan-details-modal';

interface LoanSummary {
    id: string;
    name: string;
    distributed: number;
    recovered: number;
    outstanding: number;
    interest: number;
    count: number;
}

interface LoanRecord {
    _id: string;
    emp_no: string;
    employeeId: {
        emp_no: string;
        employee_name: string;
    };
    requestType: 'loan' | 'salary_advance';
    amount: number;
    loanConfig?: {
        interestRate: number;
        totalInterest: number;
        totalAmount: number;
    };
    repayment: {
        totalPaid: number;
        remainingBalance: number;
        status: string;
    };
    status: string;
    appliedAt: string;
    disbursement?: {
        disbursedAt: string;
    };
    department?: { name: string };
    division_id?: { name: string };
}

export default function LoanReportsTab() {
    const [loading, setLoading] = useState(false);
    const [fetchingFilters, setFetchingFilters] = useState(false);
    const [records, setRecords] = useState<LoanRecord[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // View & Tab states
    const [viewMode, setViewMode] = useState<'detailed' | 'abstract'>('abstract');
    
    // Pagination states
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [limit] = useState(50);
    const [reportStats, setReportStats] = useState({
        totalDistributed: 0,
        totalRecovered: 0,
        totalOutstanding: 0,
        totalInterest: 0
    });

    // Filter states
    const [divisionIds, setDivisionIds] = useState<string[]>([]);
    const [departmentIds, setDepartmentIds] = useState<string[]>([]);
    const [employeeIds, setEmployeeIds] = useState<string[]>([]);
    const [requestType, setRequestType] = useState<string>('');
    const [status, setStatus] = useState<string>('');
    
    // Drill-down states
    const [drilldownLevel, setDrilldownLevel] = useState<'all' | 'division' | 'department' | 'employee'>('all');
    const [summaries, setSummaries] = useState<LoanSummary[]>([]);
    const [selectedLoan, setSelectedLoan] = useState<LoanRecord | null>(null);

    const loadReport = useCallback(async (pageToLoad: number = page) => {
        setLoading(true);
        try {
            let groupBy: string | undefined;
            if (viewMode === 'abstract') {
                if (drilldownLevel === 'all') groupBy = 'division';
                else if (drilldownLevel === 'division') groupBy = 'department';
                else if (drilldownLevel === 'department') groupBy = 'employee';
            }

            const params: any = {
                page: pageToLoad,
                limit,
                groupBy,
                divisionId: divisionIds.join(','),
                departmentId: departmentIds.join(','),
                employeeId: employeeIds.join(','),
                requestType: requestType || undefined,
                status: status || undefined
            };

            const response = await api.getLoanReportSummary(params);
            if (response.success) {
                setRecords(response.data || []);
                setTotalPages(response.totalPages || 1);
                setTotalCount(response.total || 0);
                setSummaries(response.summaries || []);
                if (response.stats) {
                    setReportStats(response.stats);
                }
            } else {
                toast.error(response.message || 'Failed to load report');
            }
        } catch (error) {
            console.error('Error loading loan report:', error);
            toast.error('Error loading report');
        } finally {
            setLoading(false);
        }
    }, [page, limit, viewMode, drilldownLevel, divisionIds, departmentIds, employeeIds, requestType, status]);

    useEffect(() => {
        loadInitialFilters();
    }, []);

    useEffect(() => {
        loadReport(1);
    }, [loadReport, drilldownLevel, divisionIds, departmentIds, employeeIds, viewMode, requestType, status]);

    const loadInitialFilters = async () => {
        setFetchingFilters(true);
        try {
            const divRes = await api.getDivisions(true);
            if (divRes.success) setDivisions(divRes.data || []);
        } catch (error) {
            console.error('Error loading initial filters:', error);
        } finally {
            setFetchingFilters(false);
        }
    };

    const handleDivisionChange = async (ids: string[]) => {
        setDivisionIds(ids);
        setDepartmentIds([]);
        setEmployeeIds([]);
        setDepartments([]);
        setEmployees([]);

        if (ids.length > 0) {
            setDrilldownLevel('division');
            // Extract departments directly from the divisions state
            // This is more reliable than separate API calls as it uses the Division-side link
            const selectedDivs = divisions.filter(d => ids.includes(d._id));
            const allDepts: Department[] = [];
            
            selectedDivs.forEach(div => {
                if (div.departments && Array.isArray(div.departments)) {
                    div.departments.forEach(dept => {
                        if (typeof dept === 'object' && dept !== null) {
                            // Only include active departments
                            if (dept.isActive !== false) {
                                allDepts.push(dept as Department);
                            }
                        }
                    });
                }
            });

            // Ensure uniqueness by ID
            const uniqueDepts = Array.from(new Map(allDepts.map(item => [item._id, item])).values());
            // Sort by name
            const sortedDepts = uniqueDepts.sort((a, b) => a.name.localeCompare(b.name));
            setDepartments(sortedDepts);
        } else {
            setDrilldownLevel('all');
        }
    };

    const handleDepartmentChange = async (ids: string[]) => {
        setDepartmentIds(ids);
        setEmployeeIds([]);
        setEmployees([]);

        if (ids.length > 0) {
            setDrilldownLevel('department');
            try {
                const empPromises = ids.map(id => api.getEmployees({ department_id: id, is_active: true }));
                const results = await Promise.all(empPromises);
                let allEmps: Employee[] = [];
                results.forEach(res => {
                    if (res.success) allEmps = [...allEmps, ...(res.data || [])];
                });
                const uniqueEmps = Array.from(new Map(allEmps.map(item => [item._id, item])).values());
                setEmployees(uniqueEmps);
            } catch (error) {
                console.error('Error loading employees:', error);
            }
        } else {
            setDrilldownLevel(divisionIds.length === 0 ? 'all' : 'division');
        }
    };

    const handleExport = async (format: 'xlsx' | 'pdf' = 'xlsx') => {
        const toastId = toast.loading(`Preparing your ${format.toUpperCase()} report...`);
        try {
            const params: any = {
                divisionId: divisionIds.join(','),
                departmentId: departmentIds.join(','),
                employeeId: employeeIds.join(','),
                requestType: requestType || undefined,
                status: status || undefined
            };

            let blob;
            if (format === 'xlsx') {
                blob = await api.exportLoanReport(params);
            } else {
                blob = await api.exportLoanReportPDF(params);
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `loan_report_${dayjs().format('YYYYMMDD')}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.success(`${format.toUpperCase()} report downloaded successfully`, { id: toastId });
        } catch (error: any) {
            console.error('Export error:', error);
            toast.error(error.message || 'Export failed', { id: toastId });
        }
    };

    const navigateTo = (level: 'all' | 'division' | 'department' | 'employee', id?: string) => {
        if (level === 'employee') {
            setViewMode('detailed');
            if (id) setEmployeeIds([id]);
            setDrilldownLevel('employee');
        } else {
            setViewMode('abstract');
            if (level === 'all') {
                setDivisionIds([]);
                setDepartmentIds([]);
                setEmployeeIds([]);
                setDrilldownLevel('all');
            } else if (level === 'division') {
                if (id) {
                    setDivisionIds([id]);
                    handleDivisionChange([id]);
                }
                setDepartmentIds([]);
                setEmployeeIds([]);
                setDrilldownLevel('division');
            } else if (level === 'department') {
                if (id) {
                    setDepartmentIds([id]);
                    handleDepartmentChange([id]);
                }
                setEmployeeIds([]);
                setDrilldownLevel('department');
            }
        }
        setPage(1);
    };

    const getBreadcrumbs = () => {
        const items = [{ label: 'Loans Report', level: 'all', id: 'all' }];
        if (divisionIds.length === 1) {
            const div = divisions.find(d => d._id === divisionIds[0]);
            items.push({ label: div?.name || 'Division', level: 'division', id: divisionIds[0] });
        }
        if (departmentIds.length === 1) {
            const dept = departments.find(d => d._id === departmentIds[0]);
            items.push({ label: dept?.name || 'Department', level: 'department', id: departmentIds[0] });
        }
        if (employeeIds.length === 1) {
            items.push({ label: 'Employee Detail', level: 'employee', id: employeeIds[0] });
        }
        return items;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    function renderAbstractView() {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all duration-300">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                        {drilldownLevel === 'all' ? 'Summary by Division' :
                            drilldownLevel === 'division' ? 'Summary by Department' : 'Summary by Employee'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Double-click row to drill-down</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {drilldownLevel === 'all' ? 'Division' : (drilldownLevel === 'division' ? 'Department' : 'Employee')}
                                </th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Distributed</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Recovered</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Outstanding</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Interest</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading && summaries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                                        <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gathering Stats...</p>
                                    </td>
                                </tr>
                            ) : summaries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        No data found
                                    </td>
                                </tr>
                            ) : summaries.map((item) => (
                                <tr
                                    key={item.id}
                                    className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer select-none"
                                    onDoubleClick={() => {
                                        if (drilldownLevel === 'all') navigateTo('division', item.id);
                                        else if (drilldownLevel === 'division') navigateTo('department', item.id);
                                        else if (drilldownLevel === 'department') navigateTo('employee', item.id);
                                    }}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-black text-[10px]">
                                                {drilldownLevel === 'all' ? 'DIV' : (drilldownLevel === 'division' ? 'DEPT' : 'EMP')}
                                            </div>
                                            <span className="text-xs font-black text-slate-900 dark:text-white group-hover:translate-x-1 transition-transform">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-slate-900 dark:text-white">
                                        {formatCurrency(item.distributed)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(item.recovered)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-rose-600 dark:text-rose-400">
                                        {formatCurrency(item.outstanding)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                        {formatCurrency(item.interest)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {item.count}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    function renderDetailedView() {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200 dark:bg-slate-800/30 dark:border-slate-800">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Employee</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Recovered</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Balance</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                                        <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Updating Records...</p>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        No data found
                                    </td>
                                </tr>
                            ) : (
                                records.map((loan) => (
                                    <tr 
                                        key={loan._id} 
                                        onClick={() => setSelectedLoan(loan)}
                                        className="hover:bg-indigo-50/50 transition-all dark:hover:bg-indigo-900/20 cursor-pointer group"
                                    >
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-black text-slate-900 dark:text-white">{loan.employeeId?.employee_name || 'N/A'}</p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{loan.employeeId?.emp_no || loan.emp_no}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                loan.requestType === 'loan' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'
                                            }`}>
                                                {loan.requestType === 'loan' ? 'Loan' : 'Advance'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-black text-slate-900 dark:text-white">
                                            {formatCurrency(loan.amount)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(loan.repayment?.totalPaid || 0)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-bold text-rose-600 dark:text-rose-400">
                                            {formatCurrency(loan.repayment?.remainingBalance || 0)}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                loan.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                                                loan.status === 'active' || loan.status === 'disbursed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                                                'bg-slate-100 text-slate-700 dark:bg-slate-800'
                                            }`}>
                                                {loan.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                                            {loan.disbursement?.disbursedAt ? dayjs(loan.disbursement.disbursedAt).format('DD MMM YYYY') : dayjs(loan.appliedAt).format('DD MMM YYYY')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-200 flex items-center justify-between dark:bg-slate-800/30 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        Total Records: {totalCount}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-xl hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Prev
                        </button>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{page} / {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-xl hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-8 animate-in fade-in duration-500">
            {/* Header section with breadcrumbs and actions */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {getBreadcrumbs().map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                                <button
                                    onClick={() => navigateTo(item.level as any, item.id === 'all' ? undefined : item.id)}
                                    className={`hover:text-indigo-600 transition-colors ${idx === getBreadcrumbs().length - 1 ? 'text-indigo-600' : ''}`}
                                >
                                    {item.label}
                                </button>
                            </div>
                        ))}
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Loan Analytics</h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setViewMode('abstract')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'abstract' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                            Summary
                        </button>
                        <button
                            onClick={() => setViewMode('detailed')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'detailed' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List className="h-4 w-4" />
                            Detailed
                        </button>
                    </div>

                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden xl:block" />

                    <button
                        onClick={() => handleExport('xlsx')}
                        className="h-11 px-5 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Download className="h-4 w-4" />
                        Download XLSX
                    </button>
                    <button
                        onClick={() => handleExport('pdf')}
                        className="h-11 px-5 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-rose-100 dark:shadow-none hover:bg-rose-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Download className="h-4 w-4" />
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <Wallet className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Distributed</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(reportStats.totalDistributed)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Active Disbursals</span>
                    </div>
                </div>
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <Undo2 className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Recovered</p>
                    <h3 className="text-2xl font-black text-emerald-600">{formatCurrency(reportStats.totalRecovered)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tight">
                            {reportStats.totalDistributed > 0 ? ((reportStats.totalRecovered / reportStats.totalDistributed) * 100).toFixed(1) : '0.0'}% Recovery
                        </span>
                    </div>
                </div>
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-rose-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <PieChart className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Outstanding</p>
                    <h3 className="text-2xl font-black text-rose-600">{formatCurrency(reportStats.totalOutstanding)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tight">Pending Principal</span>
                    </div>
                </div>
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <TrendingUp className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Interest</p>
                    <h3 className="text-2xl font-black text-indigo-600">{formatCurrency(reportStats.totalInterest)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">Revenue Generation</span>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 items-start">
                {/* Filters Sidebar */}
                <div className="xl:col-span-1 space-y-6 sticky top-24">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Filter className="h-4 w-4" />
                                Filters
                            </h4>
                            {(divisionIds.length > 0 || departmentIds.length > 0 || employeeIds.length > 0) && (
                                <button
                                    onClick={() => {
                                        setDivisionIds([]);
                                        setDepartmentIds([]);
                                        setEmployeeIds([]);
                                        setDrilldownLevel('all');
                                    }}
                                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <X className="h-4 w-4 text-slate-400" />
                                </button>
                            )}
                        </div>
                        <div className="p-6 space-y-6">
                            <MultiSelect
                                label="Division"
                                options={divisions.map(d => ({ id: d._id, name: d.name }))}
                                selectedIds={divisionIds}
                                onChange={handleDivisionChange}
                                loading={fetchingFilters}
                            />
                            <MultiSelect
                                label="Department"
                                options={departments.map(d => ({ id: d._id, name: d.name }))}
                                selectedIds={departmentIds}
                                onChange={handleDepartmentChange}
                                disabled={divisionIds.length === 0}
                            />
                            <MultiSelect
                                label="Employee"
                                options={employees.map(e => ({ id: e._id, name: `${e.employee_name} (${e.emp_no})` }))}
                                selectedIds={employeeIds}
                                onChange={(ids) => {
                                    setEmployeeIds(ids);
                                    if (ids.length > 0) setDrilldownLevel('employee');
                                    else if (departmentIds.length > 0) setDrilldownLevel('department');
                                }}
                                disabled={departmentIds.length === 0}
                            />

                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    Request Type
                                </label>
                                <select
                                    value={requestType}
                                    onChange={(e) => setRequestType(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                                >
                                    <option value="">All Types</option>
                                    <option value="loan">Loan Only</option>
                                    <option value="salary_advance">Salary Advance Only</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    Loan Status
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                                >
                                    <option value="">Active/Completed</option>
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="disbursed">Disbursed (Awaiting EMI)</option>
                                    <option value="all">Include Pending/Rejected</option>
                                </select>
                            </div>

                            <button
                                onClick={() => loadReport(1)}
                                className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Refresh Reports
                            </button>
                        </div>
                    </div>
                </div>

                {/* Primary Report View */}
                <div className="xl:col-span-3">
                    {viewMode === 'abstract' ? renderAbstractView() : renderDetailedView()}
                </div>

                {/* Detailed Loan Modal */}
                {selectedLoan && (
                    <LoanDetailsModal 
                        loan={selectedLoan} 
                        onClose={() => setSelectedLoan(null)} 
                    />
                )}
            </div>
        </div>
    );
}
