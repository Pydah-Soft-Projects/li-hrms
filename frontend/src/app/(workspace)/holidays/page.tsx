'use client';

import { useState, useEffect } from 'react';
import { api, Holiday } from '@/lib/api';
import Spinner from '@/components/Spinner';

export default function EmployeeHolidaysPage() {
    const [loading, setLoading] = useState(true);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    useEffect(() => {
        loadMyHolidays();
    }, [selectedYear]);

    const loadMyHolidays = async () => {
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
    };

    const getHolidayColor = (type: string) => {
        switch (type) {
            case 'National': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            case 'Regional': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
            case 'Optional': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
            case 'Company': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
            default: return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Holidays</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                            List of holidays applicable to your location and department for {selectedYear}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                            {[selectedYear - 1, selectedYear, selectedYear + 1].map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex h-64 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-800">
                        <Spinner />
                    </div>
                ) : holidays.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                            <svg className="h-8 w-8 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No Holidays Found</h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">There are no holidays scheduled for this year yet.</p>
                    </div>
                ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {holidays.map((holiday) => {
                            const date = new Date(holiday.date);
                            const isPast = date < new Date();

                            return (
                                <div
                                    key={holiday._id}
                                    className={`group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800 ${isPast ? 'opacity-70 grayscale-[0.5]' : ''}`}
                                >
                                    {/* Calendar Leaf Date */}
                                    <div className="mb-4 flex items-start justify-between">
                                        <div className="flex flex-col items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center dark:border-slate-700 dark:bg-slate-900/50">
                                            <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                                                {date.toLocaleDateString('en-US', { month: 'short' })}
                                            </span>
                                            <span className="text-xl font-bold text-slate-900 dark:text-white">
                                                {date.getDate()}
                                            </span>
                                        </div>

                                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getHolidayColor(holiday.type)}`}>
                                            {holiday.type}
                                        </span>
                                    </div>

                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {holiday.name}
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                                            {holiday.description || 'No description provided.'}
                                        </p>

                                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            {date.toLocaleDateString('en-US', { weekday: 'long' })}
                                        </div>
                                    </div>

                                    {isPast && (
                                        <div className="absolute -right-12 top-4 w-48 rotate-45 bg-slate-100 py-1 text-center text-xs font-medium text-slate-400 dark:bg-slate-700/50 dark:text-slate-500">
                                            Passed
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
