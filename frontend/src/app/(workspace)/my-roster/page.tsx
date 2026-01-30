'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { auth } from '@/lib/auth';
import {
    Calendar,
    Clock,
    Info,
    ChevronLeft,
    ChevronRight,
    Sun,
    Moon,
    Coffee,
    CalendarDays,
    Briefcase
} from 'lucide-react';

type Shift = { _id: string; name: string; code?: string; color?: string; startTime?: string; endTime?: string };
type RosterEntry = {
    date: string;
    shiftId: string | null;
    shift: Shift | null;
    status: 'WO' | 'HOL' | 'PRESENT' | 'ABSENT' | 'LEAVE' | 'OD' | 'PH' | string;
    notes?: string;
};

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMonthDisplay(monthStr: string) {
    const [y, m] = monthStr.split('-').map(Number);
    return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatMonthInput(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatLocalDate(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getMonthDays(monthStr: string) {
    const [y, m] = monthStr.split('-').map(Number);
    const days: Date[] = [];
    const end = new Date(y, m, 0).getDate();
    // Add padding days for start of month to align with Generic Calendar Grid (Sun-Sat)
    for (let d = 1; d <= end; d++) {
        days.push(new Date(y, m - 1, d));
    }
    return days;
}

// Helper to get day padding
function getStartPadding(monthStr: string) {
    const [y, m] = monthStr.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    return Array(firstDay).fill(null);
}

export default function MyRosterPage() {
    const [month, setMonth] = useState(formatMonthInput(new Date()));
    const [roster, setRoster] = useState<RosterEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        setUser(auth.getUser());
    }, []);

    const days = useMemo(() => getMonthDays(month), [month]); // Use memo only where complex logic is involved or derived state
    const startPadding = useMemo(() => getStartPadding(month), [month]);

    const loadData = async () => {
        try {
            setLoading(true);
            const resp = await api.getMyRoster(month);
            if (resp?.success) {
                setRoster(resp.data.entries || []);
            } else {
                toast.error(resp?.message || 'Failed to load roster');
            }
        } catch (err: any) {
            console.error('Error loading self roster:', err);
            toast.error('Failed to load roster data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [month]);

    const rosterMap = useMemo(() => {
        const map = new Map<string, RosterEntry>();
        roster.forEach(entry => {
            const dateKey = entry.date.split('T')[0];
            map.set(dateKey, entry);
        });
        return map;
    }, [roster]);

    const changeMonth = (offset: number) => {
        const [y, m] = month.split('-').map(Number);
        const date = new Date(y, m - 1 + offset, 1);
        setMonth(formatMonthInput(date));
    };

    // Color Helpers matching Attendance Page
    const getStatusStyle = (status: string | undefined, shift: Shift | null) => {
        if (status === 'WO') return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
        if (status === 'HOL' || status === 'PH') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
        if (status === 'LEAVE') return 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/10 dark:text-orange-400 dark:border-orange-800';
        if (status === 'OD') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
        if (shift) return 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'; // Default for shift
        return 'bg-slate-50 border-slate-100 text-slate-400 dark:bg-slate-900/50 dark:border-slate-800'; // Empty/Unknown
    };

    const getStatusLabel = (status: string | undefined) => {
        const labels: Record<string, string> = {
            'WO': 'Off',
            'HOL': 'Holiday',
            'PH': 'Holiday',
            'LEAVE': 'Leave',
            'OD': 'On Duty'
        };
        return status ? labels[status] || status : '';
    };

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col p-4 gap-4 overflow-hidden">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                            <CalendarDays className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        My Roster
                    </h1>
                </div>

                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button
                        onClick={() => changeMonth(-1)}
                        className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="px-4 font-bold text-slate-800 dark:text-white min-w-[120px] text-center text-sm">
                        {formatMonthDisplay(month)}
                    </div>

                    <button
                        onClick={() => changeMonth(1)}
                        className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />

                    <div className="relative">
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <Calendar className="w-4 h-4 text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer" />
                    </div>
                </div>
            </div>

            {/* Status Key - Bigger and Prominent */}
            <div className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm backdrop-blur-sm shrink-0 flex flex-col md:flex-row md:items-center gap-4 overflow-x-auto">
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest whitespace-nowrap">Status Key</span>
                <div className="flex items-center gap-6">
                    {[
                        { label: 'Shift', name: 'Shift', color: 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
                        { label: 'H', name: 'Holiday', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
                        { label: 'WO', name: 'Week Off', color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' },
                        { label: 'L', name: 'Leave', color: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-900/10 dark:text-orange-400 dark:border-orange-800' },
                        { label: 'OD', name: 'OD', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
                    ].map((item) => (
                        <div key={item.label} className="flex items-center gap-2 shrink-0">
                            <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold border shadow-sm ${item.color}`}>
                                {item.label === 'Shift' ? <Clock className="w-4 h-4" /> : item.label}
                            </div>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{item.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Calendar Grid - Flex Grow to fill remaining space */}
            <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                    {weekdays.map((day, i) => (
                        <div key={day} className={`py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 ${i === 0 || i === 6 ? 'text-orange-600/70 dark:text-orange-400/70' : ''}`}>
                            {day.substring(0, 3)}
                        </div>
                    ))}
                </div>

                {/* Days Grid - Scrollable if absolutely needed, but trying to fit */}
                <div className="grid grid-cols-7 flex-1 min-h-0 divide-x divide-y divide-slate-200 dark:divide-slate-700 bg-slate-200 dark:bg-slate-700">
                    {loading ? (
                        [...Array(35)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-slate-900 animate-pulse" />
                        ))
                    ) : (
                        <>
                            {/* Empty cells for padding start of month */}
                            {startPadding.map((_, i) => (
                                <div key={`pad-${i}`} className="bg-slate-50/50 dark:bg-slate-900/50 p-1" />
                            ))}

                            {days.map((date) => {
                                const dateKey = formatLocalDate(date);
                                const entry = rosterMap.get(dateKey);
                                const isToday = formatLocalDate(new Date()) === dateKey;
                                const status = entry?.status;
                                const shift = entry?.shift;

                                // Determine styles
                                const cellStyle = getStatusStyle(status, shift || null);
                                const label = getStatusLabel(status);

                                return (
                                    <div
                                        key={dateKey}
                                        className={`relative p-1 md:p-2 transition-colors hover:z-10 group overflow-hidden flex flex-col
                                            ${isToday ? 'bg-blue-50/30' : 'bg-white dark:bg-slate-900'}
                                            hover:shadow-[inset_0_0_0_2px_rgba(59,130,246,0.5)]
                                        `}
                                    >
                                        {/* Date Number */}
                                        <div className="flex items-center justify-between mb-1 shrink-0">
                                            <span className={`
                                                flex items-center justify-center w-5 h-5 md:w-6 md:h-6 rounded-md text-xs md:text-sm font-bold
                                                ${isToday
                                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                                                    : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'}
                                            `}>
                                                {date.getDate()}
                                            </span>
                                        </div>

                                        {/* Content Area - Flex-1 to center vertically if needed */}
                                        <div className="flex-1 flex flex-col justify-center min-h-0">
                                            {status === 'WO' ? (
                                                <div className={`p-1 rounded md:rounded-lg border flex flex-col items-center justify-center gap-0.5 h-full max-h-[60px] ${getStatusStyle('WO', null)}`}>
                                                    <Coffee className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-80" />
                                                    <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-wide hidden md:block">Week Off</span>
                                                    <span className="text-[8px] font-bold uppercase tracking-wide md:hidden">WO</span>
                                                </div>
                                            ) : status === 'HOL' || status === 'PH' ? (
                                                <div className={`p-1 rounded md:rounded-lg border flex flex-col items-center justify-center gap-0.5 h-full max-h-[60px] ${getStatusStyle('HOL', null)}`}>
                                                    <Sun className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-80" />
                                                    <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-wide text-center leading-tight truncate w-full px-1 hidden md:block">
                                                        {entry?.notes || 'Holiday'}
                                                    </span>
                                                    <span className="text-[8px] font-bold uppercase tracking-wide md:hidden">HOL</span>
                                                </div>
                                            ) : shift ? (
                                                <div className="group/shift relative p-1.5 md:p-2 rounded-lg border border-blue-100 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10 hover:bg-blue-100 transition-colors h-full max-h-[60px] flex flex-col justify-center">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <div
                                                            className="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm"
                                                            style={{ backgroundColor: shift.color || '#3b82f6' }}
                                                        />
                                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-700 dark:text-slate-200 leading-tight truncate">
                                                            {shift.name}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 pl-3 text-[8px] md:text-[9px] font-medium text-slate-500 dark:text-slate-400 hidden xl:flex">
                                                        {shift.startTime?.substring(0, 5)} - {shift.endTime?.substring(0, 5)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg opacity-50">
                                                    <span className="text-[10px] text-slate-400 font-medium">--</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Empty cells for padding end of month */}
                            {[...Array((42 - (startPadding.length + days.length)) % 7)].map((_, i) => (
                                <div key={`end-pad-${i}`} className="bg-slate-50/50 dark:bg-slate-900/50 p-1" />
                            ))}
                        </>
                    )}
                </div>
            </div>

        </div>
    );
}
