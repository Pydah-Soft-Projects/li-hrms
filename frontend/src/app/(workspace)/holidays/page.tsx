import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Holiday } from '@/lib/api';
import Spinner from '@/components/Spinner';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    parseISO
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function EmployeeHolidaysPage() {
    const [loading, setLoading] = useState(true);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const selectedYear = currentMonth.getFullYear();

    const loadMyHolidays = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getMyHolidays(selectedYear);
            if (response.success && response.data) {
                setHolidays(response.data);
            }
        } catch (err) {
            console.error('Error loading my holidays:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        loadMyHolidays();
    }, [loadMyHolidays]);

    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        return eachDayOfInterval({
            start: startDate,
            end: endDate,
        });
    }, [currentMonth]);

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

    const getHolidaysForDate = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return holidays.filter(h => {
            const hDate = typeof h.date === 'string' ? parseISO(h.date) : new Date(h.date);
            return format(hDate, 'yyyy-MM-dd') === dateStr;
        });
    };

    const getHolidayColor = (type: string) => {
        switch (type) {
            case 'National': return 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
            case 'Regional': return 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
            case 'Optional': return 'bg-purple-50 border-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
            case 'Company': return 'bg-orange-50 border-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
            default: return 'bg-slate-50 border-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Holiday Calendar</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            Upcoming holidays applicable to you
                        </p>
                    </div>
                </div>

                {/* Calendar View */}
                <div className="space-y-6">
                    {/* Navigation */}
                    <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex items-center gap-4">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white min-w-[150px]">
                                {format(currentMonth, 'MMMM yyyy')}
                            </h2>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={prevMonth}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                </button>
                                <button
                                    onClick={() => setCurrentMonth(new Date())}
                                    className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                                >
                                    Today
                                </button>
                                <button
                                    onClick={nextMonth}
                                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex h-64 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <Spinner />
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Grid */}
                            <div className="grid grid-cols-7">
                                {calendarDays.map((date, idx) => {
                                    const dateHolidays = getHolidaysForDate(date);
                                    const isCurrentMonth = isSameMonth(date, currentMonth);
                                    const isTodayDate = isToday(date);

                                    return (
                                        <div
                                            key={idx}
                                            className={`min-h-[120px] p-2 border-b border-r last:border-r-0 border-slate-200 dark:border-slate-700 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-700/20 ${!isCurrentMonth ? 'bg-slate-50/20 text-slate-300 dark:bg-slate-900/10 dark:text-slate-600' : ''
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${isTodayDate
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40 scale-110'
                                                    : isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'
                                                    }`}>
                                                    {format(date, 'd')}
                                                </span>
                                            </div>

                                            <div className="space-y-1.5 overflow-y-auto max-h-[85px] scrollbar-hide">
                                                {dateHolidays.map(h => (
                                                    <div
                                                        key={h._id}
                                                        className={`flex flex-col rounded-lg border px-2 py-1.5 transition-all shadow-sm ${getHolidayColor(h.type)}`}
                                                    >
                                                        <span className="text-[10px] font-bold uppercase tracking-tight truncate leading-tight">
                                                            {h.name}
                                                        </span>
                                                        <span className="text-[8px] opacity-80 font-medium truncate">
                                                            {h.type}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
