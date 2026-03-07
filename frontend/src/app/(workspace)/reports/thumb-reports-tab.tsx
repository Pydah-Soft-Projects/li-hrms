'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Search,
    Filter,
    Download,
    Fingerprint,
    RefreshCcw,
    Smartphone,
    Loader2,
    Clock,
    User,
    ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface ThumbLog {
    _id: string;
    employeeId: string;
    employeeName?: string;
    timestamp: string;
    logType: string;
    deviceName: string;
    deviceId: string;
    receivedAt?: string;
}

export default function ThumbReportsTab() {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<ThumbLog[]>([]);

    // Filter states
    const [startDate, setStartDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [employeeId, setEmployeeId] = useState('');
    const [limit, setLimit] = useState(500);

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const response = await api.getThumbReports({
                startDate: dayjs(startDate).startOf('day').toISOString(),
                endDate: dayjs(endDate).endOf('day').toISOString(),
                employeeId: employeeId || undefined,
                limit
            });

            if (response.success) {
                setLogs(response.data || []);
            } else {
                toast.error(response.message || 'Failed to load thumb logs');
            }
        } catch (error) {
            console.error('Error loading thumb logs:', error);
            toast.error('Error connecting to biometric logs');
        } finally {
            setLoading(false);
        }
    };

    const stats = {
        totalPunches: logs.length,
        activeDevices: [...new Set(logs.map(l => l.deviceId))].length,
        lastPunch: logs.length > 0 ? dayjs(logs[0].timestamp).format('hh:mm A') : 'N/A'
    };

    const handleExport = () => {
        const headers = ['Timestamp', 'Employee ID', 'Name', 'Log Type', 'Device Name', 'Received At'];
        const rows = logs.map(l => [
            dayjs(l.timestamp).format('YYYY-MM-DD HH:mm:ss'),
            l.employeeId,
            l.employeeName || 'Unknown',
            l.logType,
            l.deviceName,
            l.receivedAt ? dayjs(l.receivedAt).format('YYYY-MM-DD HH:mm:ss') : '-'
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `thumb_logs_${startDate}.csv`);
        link.click();
    };

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="border-none bg-slate-50 shadow-none dark:bg-slate-900/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 text-slate-600 dark:text-slate-400">
                        <CardTitle className="text-sm font-medium">Total Punches</CardTitle>
                        <Fingerprint className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.totalPunches}</div>
                        <p className="text-xs text-slate-500">In selected date range</p>
                    </CardContent>
                </Card>

                <Card className="border-none bg-slate-50 shadow-none dark:bg-slate-900/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 text-indigo-600 dark:text-indigo-400">
                        <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
                        <Smartphone className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.activeDevices}</div>
                        <p className="text-xs text-indigo-500">Communicated today</p>
                    </CardContent>
                </Card>

                <Card className="border-none bg-slate-50 shadow-none dark:bg-slate-900/50">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 text-amber-600 dark:text-amber-400">
                        <CardTitle className="text-sm font-medium">Latest Punch</CardTitle>
                        <RefreshCcw className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.lastPunch}</div>
                        <p className="text-xs text-amber-500">Sync is real-time</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Actions */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
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
                        <label className="text-xs font-medium text-slate-500">Employee ID</label>
                        <div className="relative">
                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Emp No..."
                                value={employeeId}
                                onChange={(e) => setEmployeeId(e.target.value)}
                                className="h-9 pl-9"
                            />
                        </div>
                    </div>
                    <div className="flex items-end space-x-2">
                        <Button onClick={loadLogs} className="h-9 w-full bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                            Fetch Logs
                        </Button>
                        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleExport}>
                            <Download className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800">
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Timestamp</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Employee</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Device</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Received At</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                                            <p className="mt-2 text-sm text-slate-500">Connecting to Biometric Database...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                                        No raw logs found for the selected criteria.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log._id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/30">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center space-x-2">
                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                    {dayjs(log.timestamp).format('DD MMM, hh:mm:ss A')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{log.employeeName}</p>
                                            <p className="text-xs text-slate-500">{log.employeeId}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${log.logType?.includes('IN')
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                }`}>
                                                {log.logType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                            <div className="flex flex-col">
                                                <span>{log.deviceName}</span>
                                                <span className="text-[10px] text-slate-400">{log.deviceId}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 italic">
                                            {log.receivedAt ? dayjs(log.receivedAt).fromNow() : '-'}
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
