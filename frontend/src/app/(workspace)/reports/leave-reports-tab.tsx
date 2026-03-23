'use client';

import { useState, useEffect } from 'react';
import { api, Division, Department, Employee } from '@/lib/api';
import { 
    FileText, 
    Download, 
    Loader2, 
    Calendar,
    Briefcase,
    Filter,
    ChevronRight,
    Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

export default function LeaveReportsTab() {
    const [loading, setLoading] = useState(false);
    const [fetchingFilters, setFetchingFilters] = useState(false);
    
    // Hierarchy states
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    
    // Selection states
    const [divisionId, setDivisionId] = useState<string>('all');
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [employeeId, setEmployeeId] = useState<string>('all');
    
    // Date states
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadInitialFilters();
    }, []);

    const loadInitialFilters = async () => {
        setFetchingFilters(true);
        try {
            const divRes = await api.getDivisions(true);
            if (divRes.success) setDivisions(divRes.data || []);
        } catch (error) {
            console.error('Error loading divisions:', error);
        } finally {
            setFetchingFilters(false);
        }
    };

    const handleDivisionChange = async (val: string) => {
        setDivisionId(val);
        setDepartmentId('all');
        setEmployeeId('all');
        setDepartments([]);
        setEmployees([]);

        if (val !== 'all') {
            try {
                const deptRes = await api.getDepartments(true, val);
                if (deptRes.success) setDepartments(deptRes.data || []);
            } catch (error) {
                console.error('Error loading departments:', error);
            }
        }
    };

    const handleDepartmentChange = async (val: string) => {
        setDepartmentId(val);
        setEmployeeId('all');
        setEmployees([]);

        if (val !== 'all') {
            try {
                const empRes = await api.getEmployees({ department_id: val, is_active: true });
                if (empRes.success) setEmployees(empRes.data || []);
            } catch (error) {
                console.error('Error loading employees:', error);
            }
        }
    };

    const handleExport = async () => {
        const toastId = toast.loading('Generating Leave PDF report...');
        setLoading(true);
        
        try {
            const blob = await api.downloadLeaveODReportPDF({
                fromDate: startDate,
                toDate: endDate,
                search: searchQuery || undefined,
                division: divisionId !== 'all' ? divisionId : undefined,
                department: departmentId !== 'all' ? departmentId : undefined,
                employeeId: employeeId !== 'all' ? employeeId : undefined,
                includeLeaves: true,
                includeODs: false, // Strictly Leaves
                includeSummary: true
            });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Leaves_Report_${startDate}_to_${endDate}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
            toast.success('Leaves PDF Downloaded Successfully!', { id: toastId });
        } catch (error: any) {
            console.error('Export error:', error);
            toast.error(error.message || 'Failed to generate PDF', { id: toastId });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl">
            {/* Header Description */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 dark:bg-indigo-950/20 dark:border-indigo-900/30">
                <div className="flex gap-4">
                    <div className="bg-indigo-600 p-2.5 rounded-xl shrink-0 shadow-lg shadow-indigo-600/20">
                        <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-wider">Leave Applications Report</h3>
                        <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-1 font-medium">
                            Generate detailed PDF reports for employee leave applications. 
                            Filter by division, department, or specific employee for precision reporting.
                        </p>
                    </div>
                </div>
            </div>

            {/* Hierarchy Filters */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5" />
                        Hierarchy Filters
                    </h4>
                    {fetchingFilters && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
                </div>
                <div className="p-5 grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Division</label>
                        <select
                            value={divisionId}
                            onChange={(e) => handleDivisionChange(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        >
                            <option value="all">All Divisions</option>
                            {divisions.map(div => <option key={div._id} value={div._id}>{div.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Department</label>
                        <select
                            value={departmentId}
                            onChange={(e) => handleDepartmentChange(e.target.value)}
                            disabled={divisionId === 'all'}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white disabled:opacity-50"
                        >
                            <option value="all">All Departments</option>
                            {departments.map(dept => <option key={dept._id} value={dept._id}>{dept.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Employee</label>
                        <select
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            disabled={departmentId === 'all'}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white disabled:opacity-50"
                        >
                            <option value="all">All Employees</option>
                            {employees.map(emp => (
                                <option key={emp._id} value={emp._id}>
                                    {emp.employee_name} ({emp.emp_no})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Date & Search */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                <div className="p-5 grid gap-6 md:grid-cols-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Quick Search</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by name or ID manually..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Download Summary Card */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm dark:bg-slate-900 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30">
                        <Download className="h-6 w-6 text-indigo-600 shadow-sm" />
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Ready for Export</p>
                        <p className="text-[11px] text-slate-500 font-medium">Download the comprehensive Leaves PDF report now.</p>
                    </div>
                </div>
                
                <button
                    onClick={handleExport}
                    disabled={loading}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-[0_8px_20px_rgba(79,70,229,0.3)] active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Generating Report...
                        </>
                    ) : (
                        <>
                            <Download className="h-4 w-4" />
                            Export Leaves (PDF)
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
