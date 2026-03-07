'use client';

import { useState, useEffect } from 'react';
import { api, Department, Division } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Search,
    Filter,
    Download,
    Calendar as CalendarIcon,
    Users,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

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
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);

    // Filter states
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [divisionId, setDivisionId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadFilters();
        loadReport();
    }, []);

    const loadFilters = async () => {
        try {
            const [deptRes, divRes] = await Promise.all([
                api.getDepartments(),
                api.getDivisions()
            ]);
            if (deptRes.success) setDepartments(deptRes.data || []);
            if (divRes.success) setDivisions(divRes.data || []);
        } catch (error) {
            console.error('Error loading filters:', error);
        }
    };

    const loadReport = async () => {
        setLoading(true);
        try {
            const params: any = {
                startDate,
                endDate
            };
            if (departmentId !== 'all') params.departmentId = departmentId;
            if (divisionId !== 'all') params.divisionId = divisionId;

            const response = await api.getAttendanceReportSummary(params);
            if (response.success) {
                setRecords(response.data || []);
            } else {
                toast.error(response.message || 'Failed to load report');
            }
        } catch (error) {
            console.error('Error loading report:', error);
            toast.error('Error loading report');
        } finally {
            setLoading(false);
        }
    };

    const filteredRecords = records.filter(record => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            record.employee?.employee_name?.toLowerCase().includes(query) ||
            record.employeeNumber?.toLowerCase().includes(query)
        );
    });

    // Calculate Stats
    const stats = {
        present: filteredRecords.filter(r => r.status === 'PRESENT' || r.status === 'HALF_DAY').length,
        absent: filteredRecords.filter(r => r.status === 'ABSENT').length,
        late: filteredRecords.filter(r => (r.totalLateInMinutes || 0) > 0).length,
        total: filteredRecords.length
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PRESENT': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'HALF_DAY': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
            case 'ABSENT': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
            case 'PARTIAL': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
            default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
        }
    };

    const handleExport = () => {
        // Basic CSV export
        const headers = ['Employee ID', 'Name', 'Date', 'Status', 'In Time', 'Out Time', 'Hours', 'Late (min)', 'Early Out (min)'];
        const rows = filteredRecords.map(r => [
            r.employeeNumber,
            r.employee?.employee_name,
            r.date,
            r.status,
            r.firstInTime ? dayjs(r.firstInTime).format('HH:mm') : '-',
            r.lastOutTime ? dayjs(r.lastOutTime).format('HH:mm') : '-',
            r.totalWorkingHours?.toFixed(2) || '0',
            r.totalLateInMinutes || '0',
            r.totalEarlyOutMinutes || '0'
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `attendance_report_${startDate}_to_${endDate}.csv`);
        link.click();
    };

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-none bg-emerald-50 shadow-none dark:bg-emerald-950/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Total Present</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{stats.present}</div>
                        <p className="text-xs text-emerald-600/60 dark:text-emerald-400/60">Includes half days</p>
                    </CardContent>
                </Card>

                <Card className="border-none bg-rose-50 shadow-none dark:bg-rose-950/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-rose-600 dark:text-rose-400">Total Absent</CardTitle>
                        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-rose-900 dark:text-rose-100">{stats.absent}</div>
                        <p className="text-xs text-rose-600/60 dark:text-rose-400/60">For the selected period</p>
                    </CardContent>
                </Card>

                <Card className="border-none bg-amber-50 shadow-none dark:bg-amber-950/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">Late Entries</CardTitle>
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{stats.late}</div>
                        <p className="text-xs text-amber-600/60 dark:text-amber-400/60">Exceeding grace time</p>
                    </CardContent>
                </Card>

                <Card className="border-none bg-indigo-50 shadow-none dark:bg-indigo-950/20">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Total Records</CardTitle>
                        <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{stats.total}</div>
                        <p className="text-xs text-indigo-600/60 dark:text-indigo-400/60">Filtered results</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Actions */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">Start Date</label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">End Date</label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">Department</label>
                        <Select value={departmentId} onValueChange={setDepartmentId}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {departments.map(d => (
                                    <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500">Division</label>
                        <Select value={divisionId} onValueChange={setDivisionId}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="All Divisions" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Divisions</SelectItem>
                                {divisions.map(d => (
                                    <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-end space-x-2">
                        <Button onClick={loadReport} className="h-9 w-full bg-indigo-600 hover:bg-indigo-700">
                            Apply Filters
                        </Button>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleExport}>
                            <Download className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="mt-4 flex items-center space-x-2">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            type="search"
                            placeholder="Search by name or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-9"
                        />
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800">
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">In Time</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Out Time</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Hours</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right text-rose-500">Late</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                                            <p className="mt-2 text-sm text-slate-500">Fetching report data...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                        No attendance records found for the selected filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredRecords.map((record) => (
                                    <tr key={record._id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/30">
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{record.employee?.employee_name}</p>
                                            <p className="text-xs text-slate-500">{record.employeeNumber}</p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                            {dayjs(record.date).format('DD MMM, YYYY')}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(record.status)}`}>
                                                {record.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                            {record.firstInTime ? dayjs(record.firstInTime).format('hh:mm A') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                            {record.lastOutTime ? dayjs(record.lastOutTime).format('hh:mm A') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-900 dark:text-slate-100">
                                            {record.totalWorkingHours?.toFixed(2) || '0.00'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-right text-rose-500 font-medium">
                                            {record.totalLateInMinutes ? `${record.totalLateInMinutes}m` : '-'}
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
