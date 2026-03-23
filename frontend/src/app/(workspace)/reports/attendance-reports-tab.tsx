'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Department, Division, Employee } from '@/lib/api';
import {
    Search,
    Download,
    Users,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
    Calendar,
    LayoutGrid,
    List,
    ChevronRight,
    Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { format } from 'date-fns';

interface AttendanceSummary {
    id: string;
    name: string;
    totalCount: number;
    present: number;
    absent: number;
    wo: number;
    hol: number;
    avgPresent: string;
    avgAbsent: string;
    presentPercent: string;
    late: number;
    leave: number;
    od?: number;
    totalPresent?: number;
    totalAbsent?: number;
    totalWO?: number;
    totalHOL?: number;
    totalLate?: number;
    totalOD?: number;
    lateMinutes: number;
}

interface AttendanceRecord {
    _id: string;
    employeeNumber: string;
    employee: {
        emp_no: string;
        employee_name: string;
        department_id?: { name: string };
        division_id?: { name: string };
    };
    date: string;
    status: string;
    firstInTime?: string;
    lastOutTime?: string;
    totalWorkingHours?: number;
    payableShifts?: number;
    totalLateInMinutes?: number;
    totalEarlyOutMinutes?: number;
}

export default function AttendanceReportsTab() {
    const [loading, setLoading] = useState(false);
    const [fetchingFilters, setFetchingFilters] = useState(false);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // View & Tab states
    const [viewMode, setViewMode] = useState<'detailed' | 'abstract'>('abstract');
    const [activeTab, setActiveTab] = useState<'today' | 'monthly' | 'range'>('monthly');

    // Pagination states
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [limit] = useState(50);
    const [reportStats, setReportStats] = useState({ 
        present: 0, 
        absent: 0, 
        late: 0, 
        onLeave: 0, 
        daysInRange: 1 
    });

    // Monthly selection states
    const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

    // Filter states
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [divisionId, setDivisionId] = useState<string>('all');
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [employeeId, setEmployeeId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Drill-down states
    const [drilldownLevel, setDrilldownLevel] = useState<'all' | 'division' | 'department' | 'employee'>('all');
    const [summaries, setSummaries] = useState<AttendanceSummary[]>([]);

    // Export Dialog states
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportParams, setExportParams] = useState({
        startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
        endDate: dayjs().format('YYYY-MM-DD'),
        departmentId: 'all',
        divisionId: 'all',
        employeeId: 'all',
        strict: false
    });

    const loadReport = useCallback(async (pageToLoad: number = page) => {
        setLoading(true);
        try {
            // Determine groupBy based on drilldownLevel
            let groupBy: string | undefined;
            if (viewMode === 'abstract') {
                if (drilldownLevel === 'all') groupBy = 'division';
                else if (drilldownLevel === 'division') groupBy = 'department';
                else if (drilldownLevel === 'department') groupBy = 'employee';
            }

            const params: any = {
                page: pageToLoad,
                limit,
                search: searchQuery,
                groupBy
            };

            if (activeTab === 'monthly') {
                params.month = selectedMonth;
                params.year = selectedYear;
            } else if (activeTab === 'today') {
                params.startDate = dayjs().format('YYYY-MM-DD');
                params.endDate = dayjs().format('YYYY-MM-DD');
            } else {
                params.startDate = startDate;
                params.endDate = endDate;
            }

            if (departmentId !== 'all') params.departmentId = departmentId;
            if (divisionId !== 'all') params.divisionId = divisionId;
            if (employeeId !== 'all') params.employeeId = employeeId;

            const response = await api.getAttendanceReportSummary(params);
            if (response.success) {
                setRecords(response.data || []);
                setTotalPages(response.totalPages || 1);
                setTotalCount(response.total || 0);
                setPage(response.page || pageToLoad);
                setSummaries(response.summaries || []);
                if (response.stats) {
                    setReportStats({
                        present: response.stats.present || 0,
                        absent: response.stats.absent || 0,
                        late: response.stats.late || 0,
                        onLeave: response.stats.onLeave || 0,
                        daysInRange: response.stats.daysInRange || 1
                    });
                }
            } else {
                toast.error(response.message || 'Failed to load report');
            }
        } catch (error) {
            console.error('Error loading report:', error);
            toast.error('Error loading report');
        } finally {
            setLoading(false);
        }
    }, [page, limit, searchQuery, viewMode, drilldownLevel, activeTab, selectedMonth, selectedYear, startDate, endDate, departmentId, divisionId, employeeId]);

    useEffect(() => {
        loadInitialFilters();
    }, []);

    useEffect(() => {
        loadReport(1);
    }, [loadReport, drilldownLevel, divisionId, departmentId, employeeId, viewMode, activeTab, selectedMonth, selectedYear]);

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
            setDrilldownLevel('division');
            try {
                const deptRes = await api.getDepartments(true, val);
                if (deptRes.success) setDepartments(deptRes.data || []);
            } catch (error) {
                console.error('Error loading departments:', error);
            }
        } else {
            setDrilldownLevel('all');
        }
    };

    const handleDepartmentChange = async (val: string) => {
        setDepartmentId(val);
        setEmployeeId('all');
        setEmployees([]);

        if (val !== 'all') {
            setDrilldownLevel('department');
            try {
                const empRes = await api.getEmployees({ department_id: val, is_active: true });
                if (empRes.success) setEmployees(empRes.data || []);
            } catch (error) {
                console.error('Error loading employees:', error);
            }
        } else {
            setDrilldownLevel(divisionId === 'all' ? 'all' : 'division');
        }
    };

    const handleAdvancedExport = async (format: 'xlsx' | 'pdf' = 'xlsx') => {
        const toastId = toast.loading(`Preparing your ${format.toUpperCase()} report...`);
        try {
            const params: any = {
                startDate: exportParams.startDate,
                endDate: exportParams.endDate,
                divisionId: divisionId,
                departmentId: departmentId,
                employeeId: employeeId,
                groupBy: drilldownLevel === 'all' ? 'division' : (drilldownLevel === 'division' ? 'department' : 'employee')
            };
            if (exportParams.strict) params.strict = true;

            if (activeTab === 'monthly') {
                params.month = selectedMonth;
                params.year = selectedYear;
                delete params.startDate;
                delete params.endDate;
            }

            let blob;
            let extension;
            if (format === 'xlsx') {
                blob = await api.exportAttendanceReport(params);
                extension = 'xlsx';
            } else {
                blob = await api.exportAttendanceReportPDF(params);
                extension = 'pdf';
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `attendance_report_${params.startDate || 'payroll'}_to_${params.endDate || 'period'}.${extension}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.success(`${format.toUpperCase()} report downloaded successfully`, { id: toastId });
            setIsExportDialogOpen(false);
        } catch (error: any) {
            console.error('Export error:', error);
            toast.error(error.message || 'Export failed', { id: toastId });
        }
    };

    const navigateTo = (level: 'all' | 'division' | 'department' | 'employee', id?: string) => {
        if (level === 'employee') {
            setViewMode('detailed');
            if (id) setEmployeeId(id);
            setDrilldownLevel('employee');
        } else {
            setViewMode('abstract');
            if (level === 'all') {
                setDivisionId('all');
                setDepartmentId('all');
                setEmployeeId('all');
                setDrilldownLevel('all');
            } else if (level === 'division') {
                if (id) {
                    setDivisionId(id);
                    handleDivisionChange(id);
                }
                setDepartmentId('all');
                setEmployeeId('all');
                setDrilldownLevel('division');
            } else if (level === 'department') {
                if (id) {
                    setDepartmentId(id);
                    handleDepartmentChange(id);
                }
                setEmployeeId('all');
                setDrilldownLevel('department');
            }
        }
        setPage(1); 
    };

    const getBreadcrumbs = () => {
        const items = [{ label: 'Reports', level: 'all', id: 'all' }];
        if (divisionId !== 'all') {
            const div = divisions.find(d => d._id === divisionId);
            items.push({ label: div?.name || 'Division', level: 'division', id: divisionId });
        }
        if (departmentId !== 'all') {
            const dept = departments.find(d => d._id === departmentId);
            items.push({ label: dept?.name || 'Department', level: 'department', id: departmentId });
        }
        if (employeeId !== 'all') {
            items.push({ label: 'Employee Stats', level: 'employee', id: employeeId });
        }
        return items;
    };

    const formatDuration = (mins: number) => {
        if (!mins) return '0m';
        const totalMins = Math.round(mins);
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PRESENT': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' ;
            case 'HALF_DAY': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' ;
            case 'ABSENT': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' ;
            case 'PARTIAL': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' ;
            default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800' ;
        }
    };

    function renderAbstractView() {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                        <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                            {drilldownLevel === 'all' ? 'Attendance by Division' :
                                drilldownLevel === 'division' ? `Departments in ${divisions.find(d => d._id === divisionId)?.name || 'Division'}` :
                                    `Employees in ${departments.find(d => d._id === departmentId)?.name || 'Department'}`}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Double-click row to drill-down</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{drilldownLevel === 'all' ? 'Division' : (drilldownLevel === 'division' ? 'Department' : 'Employee')}</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Days</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Present">P</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Absent">A</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Late">L</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="On Duty">OD</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Leaves">LVE</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Week Off">WO</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Holiday">HOL</th>
                                    <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center" title="Average Present Days per Employee">P. Days</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Present %</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {loading && summaries.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} className="py-20 text-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                                            <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aggregating Data...</p>
                                        </td>
                                    </tr>
                                ) : summaries.map((item) => (
                                    <tr
                                        key={item.id}
                                        className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer select-none active:bg-indigo-50/50"
                                        onDoubleClick={() => {
                                            if (drilldownLevel === 'all') navigateTo('division', item.id);
                                            else if (drilldownLevel === 'division') navigateTo('department', item.id);
                                            // No drilldown for employee level
                                        }}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                                    {drilldownLevel === 'all' ? 'Div' : (drilldownLevel === 'division' ? 'Dept' : 'Emp')}
                                                </div>
                                                <span className="text-xs font-black text-slate-900 dark:text-white group-hover:translate-x-1 transition-transform">{item.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {reportStats.daysInRange}
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {item.avgPresent}
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-rose-600 dark:text-rose-400">
                                            {item.avgAbsent}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <p className="text-xs font-black text-amber-500">{item.totalLate ?? item.late}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{formatDuration(item.lateMinutes)}</p>
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {item.totalOD ?? item.od ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {item.leave || 0}
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {item.totalWO ?? item.wo ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {item.totalHOL ?? item.hol ?? 0}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                                                {item.avgPresent}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                                Number(item.presentPercent) >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                                                    Number(item.presentPercent) >= 75 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' :
                                                        'bg-rose-100 text-rose-700 dark:bg-rose-900/30'
                                            }`}>
                                                {item.presentPercent}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {drilldownLevel !== 'department' && (
                                                <button
                                                    onClick={() => {
                                                        if (drilldownLevel === 'all') navigateTo('division', item.id);
                                                        else if (drilldownLevel === 'division') navigateTo('department', item.id);
                                                    }}
                                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 uppercase tracking-widest transition-colors flex items-center gap-1 mx-auto"
                                                >
                                                    Drill Down
                                                    <ChevronRight className="h-3 w-3" />
                                                </button>
                                            )}
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

    function renderDetailedView() {
        return (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200 dark:bg-slate-800/30 dark:border-slate-800">
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">In Time</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Out Time</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Hours</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right text-rose-500">Late</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                                            <p className="mt-3 text-xs text-slate-500 font-bold uppercase tracking-widest">Updating Records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-500 font-bold uppercase tracking-widest">
                                        No attendance records found
                                    </td>
                                </tr>
                            ) : (
                                records.map((record) => (
                                    <tr key={record._id} className="hover:bg-slate-50/80 transition-all dark:hover:bg-slate-800/50">
                                        <td className="px-4 py-3">
                                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{record.employee?.employee_name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{record.employeeNumber}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-bold whitespace-nowrap">
                                            {dayjs(record.date).format('DD MMM, YYYY')}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${getStatusColor(record.status)}`}>
                                                {record.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-bold whitespace-nowrap">
                                            {record.firstInTime ? dayjs(record.firstInTime).format('hh:mm A') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-bold whitespace-nowrap">
                                            {record.lastOutTime ? dayjs(record.lastOutTime).format('hh:mm A') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-right font-black text-slate-900 dark:text-white">
                                            {record.totalWorkingHours?.toFixed(2) || '0.00'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-right text-rose-500 font-black">
                                            {record.totalLateInMinutes ? `${record.totalLateInMinutes}m` : '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="bg-slate-50/50 px-4 py-3 border-t border-slate-200 flex items-center justify-between dark:bg-slate-800/30 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="px-3 py-1 text-[10px] font-bold border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Previous
                        </button>
                        <div className="text-[10px] font-black text-slate-900 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 dark:text-white">
                            {page} / {totalPages}
                        </div>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                            className="px-3 py-1 text-[10px] font-bold border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
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
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setActiveTab('today')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'today' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Today
                        </button>
                        <button
                            onClick={() => setActiveTab('monthly')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'monthly' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setActiveTab('range')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'range' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Range
                        </button>
                    </div>

                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setViewMode('abstract')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'abstract' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('detailed')}
                            className={`p-1.5 rounded-lg transition-all ${viewMode === 'detailed' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}
                        >
                            <List className="h-4 w-4" />
                        </button>
                    </div>

                    <button
                        onClick={() => setIsExportDialogOpen(true)}
                        className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_4px_12px_rgba(79,70,229,0.3)] active:scale-95 flex items-center gap-2"
                    >
                        <Download className="h-4 w-4" />
                        Export XLSX
                    </button>
                </div>
            </div>

            {/* Monthly Selector - Styled simply */}
            {activeTab === 'monthly' && (
                <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select Period:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500/20 outline-none dark:bg-slate-800 dark:border-slate-700"
                        >
                            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                                <option key={i} value={(i + 1).toString()}>{m}</option>
                            ))}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500/20 outline-none dark:bg-slate-800 dark:border-slate-700"
                        >
                            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                                <option key={y} value={y.toString()}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Payroll Period logic applied automatically
                    </p>
                </div>
            )}

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="relative overflow-hidden group rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                    <div className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 mb-4">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {activeTab === 'today' ? 'Present' : 'Total Working Days'}
                        </span>
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                        {activeTab === 'today' ? reportStats.present : reportStats.daysInRange}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {activeTab === 'today' ? 'Total employees present' : 'Calculated payroll days'}
                    </p>
                </div>

                <div className="relative overflow-hidden group rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                    <div className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 mb-4">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {activeTab === 'today' ? 'Present %' : 'Total P. Days'}
                        </span>
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                            <Users className="h-4 w-4 text-indigo-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                        {activeTab === 'today' 
                            ? (totalCount > 0 ? ((reportStats.present / totalCount) * 100).toFixed(0) : 0) + '%'
                            : reportStats.present.toFixed(1)
                        }
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {activeTab === 'today' ? 'Current rate' : 'Total Present Days (Group)'}
                    </p>
                </div>

                <div className="relative overflow-hidden group rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                    <div className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 mb-4">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                             {activeTab === 'today' ? 'Absent' : 'Total A. Days'}
                        </span>
                        <div className="p-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl">
                            <XCircle className="h-4 w-4 text-rose-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                        {activeTab === 'today'
                            ? reportStats.absent
                            : reportStats.absent.toFixed(1)
                        }
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {activeTab === 'today' ? 'Total absent today' : 'Total Absent Days (Group)'}
                    </p>
                </div>

                <div className="relative overflow-hidden group rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
                    <div className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 mb-4">
                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {activeTab === 'today' ? 'Late' : 'Total Leave'}
                        </span>
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                            <Calendar className="h-4 w-4 text-amber-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">
                        {activeTab === 'today' ? reportStats.late : reportStats.onLeave}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {activeTab === 'today' ? 'Arrived late' : 'Approved leave count'}
                    </p>
                </div>
            </div>

            {/* Filters Section for Range Tab */}
            {activeTab === 'range' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-wrap items-end gap-4">
                    <div className="space-y-1.5 min-w-[140px]">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700"
                        />
                    </div>
                    <div className="space-y-1.5 min-w-[140px]">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:bg-slate-800 dark:border-slate-700"
                        />
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            {viewMode === 'abstract' ? renderAbstractView() : renderDetailedView()}

            {isExportDialogOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Advanced Export</h3>
                            <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-wider">Configure export parameters</p>
                        </div>
                        <div className="p-6 space-y-4">
                             <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500">Start Date</label>
                                    <input type="date" value={exportParams.startDate} onChange={e => setExportParams({...exportParams, startDate: e.target.value})} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500">End Date</label>
                                    <input type="date" value={exportParams.endDate} onChange={e => setExportParams({...exportParams, endDate: e.target.value})} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold" />
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30">
                                <input type="checkbox" checked={exportParams.strict} onChange={e => setExportParams({...exportParams, strict: e.target.checked})} className="h-4 w-4 rounded" />
                                <label className="text-[10px] font-black uppercase text-indigo-700">Strict HRMS Mapping</label>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-3">
                            <button onClick={() => setIsExportDialogOpen(false)} className="flex-1 h-10 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                            <button onClick={() => handleAdvancedExport('xlsx')} className="flex-[2] min-w-[120px] h-10 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-colors shadow-sm">Export XLSX</button>
                            <button onClick={() => handleAdvancedExport('pdf')} className="flex-[2] min-w-[120px] h-10 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-rose-700 transition-colors shadow-sm">Export PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

