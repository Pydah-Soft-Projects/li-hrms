'use client';

import { useState, useEffect } from 'react';
import { api, Division, Department } from '@/lib/api';
import {
    Banknote,
    Search,
    Download,
    Eye,
    Filter,
    Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';

/**
 * Renders the Second Salary Payslips page with filters, search, and a table of payslip records.
 *
 * @returns The page React element containing controls to filter by month, division, and department, a text search for employee name or ID, and a table listing matching 2nd salary payslips with actions to view or download each payslip.
 */
export default function SecondSalaryPayslipsPage() {
    const [records, setRecords] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Filters
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDivision, setSelectedDivision] = useState<string>('');
    const [selectedDepartment, setSelectedDepartment] = useState<string>('');

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        fetchRecords();
    }, [month, selectedDivision, selectedDepartment]);

    const fetchInitialData = async () => {
        try {
            const [divRes, deptRes] = await Promise.all([
                api.get('/divisions'),
                api.get('/departments')
            ]);
            if (divRes.success) setDivisions(divRes.data);
            if (deptRes.success) setDepartments(deptRes.data);
        } catch (error) {
            console.error('Error fetching initial data:', error);
        }
    };

    const fetchRecords = async () => {
        setIsLoading(true);
        try {
            const query = new URLSearchParams();
            if (month) query.append('month', month);
            if (selectedDivision) query.append('divisionId', selectedDivision);
            if (selectedDepartment) query.append('departmentId', selectedDepartment);

            const res = await api.get(`/second-salary/records?${query.toString()}`);
            if (res.success) {
                setRecords(res.data);
            } else {
                setRecords([]);
            }
        } catch (error) {
            console.error('Error fetching records:', error);
            toast.error('Failed to fetch payslips');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const filteredRecords = records.filter((record: any) =>
        record.employeeId?.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.emp_no?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Banknote className="w-7 h-7 text-emerald-600" />
                        2nd Salary Payslips
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">View and download employee payslips</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Month</label>
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Division</label>
                        <select
                            value={selectedDivision}
                            onChange={(e) => setSelectedDivision(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
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
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                        >
                            <option value="">All Departments</option>
                            {departments
                                .filter(dept => !selectedDivision || dept.divisions?.includes(selectedDivision as any))
                                .map(dept => <option key={dept._id} value={dept._id}>{dept.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Search</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Name or Emp ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Records Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Emp No</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Department</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Net 2nd Salary</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                            <p className="text-slate-500 text-sm font-medium">Loading records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                            <Filter className="w-10 h-10 text-slate-400" />
                                            <p className="text-slate-500 text-sm font-medium">No records found matching filters</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredRecords.map((record: any) => (
                                    <tr key={record._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900 dark:to-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase">
                                                    {record.employeeId?.employee_name?.[0] || 'E'}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                                                        {record.employeeId?.employee_name || 'Unknown'}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">
                                                        {record.employeeId?.designation_id?.name || 'Employee'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                                            {record.emp_no}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                            {
                                                record.employeeId?.department_id?.name ||
                                                departments.find(d => d._id === record.employeeId?.department_id)?.name ||
                                                'Unknown'
                                            }
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="text-sm font-bold text-emerald-600">
                                                {formatCurrency(record.netSalary || 0)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <a
                                                    href={`/superadmin/payslips/second-salary/${record._id}`}
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                                    title="View Payslip"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </a>
                                                <button
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
                                                    title="Download PDF"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}