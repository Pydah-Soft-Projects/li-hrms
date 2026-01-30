'use client';

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { api, Division, Department, Designation } from '@/lib/api';
import {
    Banknote,
    Calendar,
    ChevronRight,
    Plus,
    Loader2,
    CheckCircle2,
    Clock,
    Building2,
    Users,
    ArrowRight,
    ArrowLeftRight,
    Download,
    Search
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

export default function SecondSalaryPaymentsPage() {
    const [batches, setBatches] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const [viewMode, setViewMode] = useState<'batches' | 'comparison'>('batches');

    // Filters
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);

    const [selectedDivision, setSelectedDivision] = useState<string>('');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('');
    const [selectedDesignation, setSelectedDesignation] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    // Comparison Data
    const [comparisonData, setComparisonData] = useState<any[]>([]);
    const [isComparing, setIsComparing] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (viewMode === 'batches') {
            fetchBatches();
        } else {
            fetchComparison();
        }
    }, [month, selectedDivision, selectedDepartment, selectedDesignation, viewMode, searchTerm]);

    const fetchInitialData = async () => {
        try {
            const [divRes, deptRes, desigRes] = await Promise.all([
                api.get('/divisions'),
                api.get('/departments'),
                api.get('/designations')
            ]);
            if (divRes.success) setDivisions(divRes.data);
            if (deptRes.success) setDepartments(deptRes.data);
            if (desigRes.success) setDesignations(desigRes.data);
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    };

    const fetchBatches = async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams();
            if (month) query.append('month', month);
            if (selectedDivision) query.append('divisionId', selectedDivision);
            if (selectedDepartment) query.append('departmentId', selectedDepartment);

            const res = await api.get(`/second-salary/batches?${query.toString()}`);
            if (res.success) {
                setBatches(res.data);
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchComparison = async () => {
        // Debounce search could be added here, but for now direct call
        setIsComparing(true);
        try {
            const query = new URLSearchParams();
            if (month) query.append('month', month);
            if (selectedDivision) query.append('divisionId', selectedDivision);
            if (selectedDepartment) query.append('departmentId', selectedDepartment);
            if (selectedDesignation) query.append('designationId', selectedDesignation);
            if (searchTerm) query.append('search', searchTerm);

            const res = await api.get(`/second-salary/comparison?${query.toString()}`);
            if (res.success) {
                setComparisonData(res.data);
            }
        } catch (error) {
            console.error('Error fetching comparison:', error);
            toast.error('Failed to load comparison data');
        } finally {
            setIsComparing(false);
        }
    };

    const handleRunPayroll = async () => {
        if (!selectedDivision || !selectedDepartment || !month) {
            toast.error('Please select Division, Department and Month');
            return;
        }

        setIsCalculating(true);
        try {
            const res = await api.post('/second-salary/calculate', {
                divisionId: selectedDivision,
                departmentId: selectedDepartment,
                month
            });

            if (res.success) {
                const { successCount, failCount } = res.data || res;
                if (failCount === 0) {
                    toast.success(`Success: 2nd Salary calculated for ${successCount} employees.`);
                } else {
                    toast.warning(`Calculated ${successCount} successfully, but ${failCount} failed.`);
                }
                fetchBatches();
            } else {
                toast.error(res.message || 'Failed to calculate');
            }
        } catch (error: any) {
            toast.error(error.message || 'Error running 2nd salary payroll');
        } finally {
            setIsCalculating(false);
        }
    };

    const handleCalculateAll = async () => {
        if (!month) {
            Swal.fire('Error', 'Please select Month', 'error');
            return;
        }

        const result = await Swal.fire({
            title: 'Global Calculation',
            text: `This will calculate 2nd salary for ALL employees across ALL divisions and departments for ${month}. Continue?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, calculate all!'
        });

        if (!result.isConfirmed) return;

        setIsCalculating(true);
        try {
            const res = await api.post('/second-salary/calculate', {
                divisionId: 'all',
                departmentId: 'all',
                month
            });

            if (res.success) {
                const { successCount, failCount } = res.data || res;
                if (failCount === 0) {
                    toast.success(`Global success: 2nd Salary calculated for ${successCount} employees.`);
                } else {
                    toast.warning(`Global processing complete. ${successCount} success, ${failCount} failed.`);
                }
                fetchBatches();
            } else {
                toast.error(res.message || 'Failed to calculate');
            }
        } catch (error: any) {
            toast.error(error.message || 'Error running global calculation');
        } finally {
            setIsCalculating(false);
        }
    };

    const handleExportExcel = () => {
        if (comparisonData.length === 0) {
            toast.warning('No data to export');
            return;
        }

        const exportData = comparisonData.map(item => ({
            'Employee ID': item.employee.emp_no,
            'Name': item.employee.name,
            'Department': item.employee.department,
            'Designation': item.employee.designation,
            'Regular Net Salary': item.regularNetSalary,
            '2nd Salary Net': item.secondSalaryNet,
            'Difference': item.difference,
            'Month': month
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Salary Comparison");
        XLSX.writeFile(wb, `Salary_Comparison_${month}.xlsx`);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'complete':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</span>;
            case 'approved':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><CheckCircle2 className="w-3 h-3 mr-1" /> Approved</span>;
            case 'freeze':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 mr-1" /> Frozen</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400">Pending</span>;
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Banknote className="w-7 h-7 text-indigo-600" />
                        2nd Salary Payments
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage and calculate secondary salary cycles</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setViewMode(viewMode === 'batches' ? 'comparison' : 'batches')}
                        className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl transition-all shadow-sm ${viewMode === 'comparison'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                            : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <ArrowLeftRight className="w-4 h-4 mr-2" />
                        {viewMode === 'batches' ? 'Comparison Mode' : 'Batches Mode'}
                    </button>

                    {viewMode === 'batches' && (
                        <>
                            <button
                                onClick={handleCalculateAll}
                                disabled={isCalculating || !month}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-200 disabled:opacity-50"
                            >
                                {isCalculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                                Calculate for All
                            </button>
                            <Link
                                href="/superadmin/payslips/second-salary"
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                            >
                                View Payslips
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {/* Run Payroll Card (Only in Batches Mode) */}
            {viewMode === 'batches' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-indigo-500" />
                            Run New 2nd Salary Cycle (Selected Dept)
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Division</label>
                                <select
                                    value={selectedDivision}
                                    onChange={(e) => setSelectedDivision(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                >
                                    <option value="">Select Division</option>
                                    {divisions.map(div => <option key={div._id} value={div._id}>{div.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Department</label>
                                <select
                                    value={selectedDepartment}
                                    onChange={(e) => setSelectedDepartment(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                >
                                    <option value="">Select Department</option>
                                    {departments
                                        .filter(dept => !selectedDivision || dept.divisions?.includes(selectedDivision as any))
                                        .map(dept => <option key={dept._id} value={dept._id}>{dept.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Month</label>
                                <input
                                    type="month"
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>

                            <div className="flex items-end">
                                <button
                                    onClick={handleRunPayroll}
                                    disabled={isCalculating || !selectedDepartment || !selectedDivision}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                                >
                                    {isCalculating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Calculating...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Run 2nd Salary
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Comparison Controls & Filters (Only in Comparison Mode) */}
            {viewMode === 'comparison' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <ArrowLeftRight className="w-5 h-5 text-indigo-500" />
                            Salary Comparison
                        </h2>
                        <button
                            onClick={handleExportExcel}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export Excel
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Month</label>
                            <input
                                type="month"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Division</label>
                            <select
                                value={selectedDivision}
                                onChange={(e) => setSelectedDivision(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                            >
                                <option value="">All Divisions</option>
                                {divisions.map(div => <option key={div._id} value={div._id}>{div.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Department</label>
                            <select
                                value={selectedDepartment}
                                onChange={(e) => setSelectedDepartment(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                            >
                                <option value="">All Departments</option>
                                {departments
                                    .filter(dept => !selectedDivision || dept.divisions?.includes(selectedDivision as any))
                                    .map(dept => <option key={dept._id} value={dept._id}>{dept.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Designation</label>
                            <select
                                value={selectedDesignation}
                                onChange={(e) => setSelectedDesignation(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                            >
                                <option value="">All Designations</option>
                                {designations.map(des => <option key={des._id} value={des._id}>{des.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Search</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Name or Emp ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Batches Table (Only in Batches Mode) */}
            {viewMode === 'batches' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 dark:text-white">Recent Batches</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Batch Info</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Stats</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total Net</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                                <p className="text-slate-500 text-sm font-medium">Loading batches...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : batches.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <Calendar className="w-10 h-10 text-slate-400" />
                                                <p className="text-slate-500 text-sm font-medium">No batches found for this month</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    batches.map((batch) => (
                                        <tr key={batch._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                                                        {batch.batchNumber}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <Calendar className="w-3 h-3" />
                                                        {batch.monthName || batch.month}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2">
                                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                    {batch.department?.name || 'Unknown'}
                                                </div>
                                                <div className="text-[10px] text-slate-400 ml-5">
                                                    {batch.division?.name || ''}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1.5 font-medium">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    {batch.totalEmployees} <span className="text-slate-400 text-xs font-normal">Emp</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatCurrency(batch.totalNetSalary)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {getStatusBadge(batch.status)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link
                                                    href={`/superadmin/payments/second-salary/${batch._id}`}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all inline-flex items-center"
                                                    title="View Details"
                                                >
                                                    <ChevronRight className="w-5 h-5" />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Comparison Table (Only in Comparison Mode) */}
            {viewMode === 'comparison' && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Regular Salary</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">2nd Salary</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Difference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {isComparing ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                                <p className="text-slate-500 text-sm font-medium">Loading comparison data...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : comparisonData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-40">
                                                <Users className="w-10 h-10 text-slate-400" />
                                                <p className="text-slate-500 text-sm font-medium">No records found matching criteria</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    comparisonData.map((item) => (
                                        <tr key={item.employee._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                        {item.employee.name}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-mono">
                                                        {item.employee.emp_no} • {item.employee.designation}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2">
                                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                    {item.employee.department}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatCurrency(item.regularNetSalary)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                    {formatCurrency(item.secondSalaryNet)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className={`text-sm font-bold ${item.difference >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-500'}`}>
                                                    {formatCurrency(item.difference)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
