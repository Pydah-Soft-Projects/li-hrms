"use client";

import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

interface ActivityLog {
    _id: string;
    timestamp: string;
    employee: {
        name: string;
        number: string;
        department: string;
        designation: string;
    };
    punch: {
        type: string; // IN / OUT
        subType: string; // CHECK-IN, BREAK-OUT etc.
        device: string;
    };
    shift: {
        name: string;
        startTime: string;
        endTime: string;
    };
    status: string;
}

export default function RecentActivityFeed() {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchActivity = async () => {
        try {
            // Create a dedicated API method for this or use raw fetch wrapper if api lib is strict
            // Assuming api.get returns the data payload directly or axios response
            const response = await api.getRecentActivity();
            if (response.data && response.data.success) {
                setActivities(response.data.data);
                setError(null);
            }
        } catch (err) {
            console.error('Failed to fetch recent activity:', err);
            // Don't show error to user persistently, just log it, as it's a live feed
            // setError('Failed to load live feed'); 
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();

        // Poll every 30 seconds
        intervalRef.current = setInterval(fetchActivity, 30000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC' // Backend provides pre-shifted IST as UTC
        });
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
    };

    if (loading && activities.length === 0) {
        return (
            <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm h-full min-h-[400px] flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        Live Activity
                    </h2>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-medium">Connecting to Biometric Feed...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-slate-100 p-0 shadow-sm h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    Live Activity
                </h2>
                <span className="text-xs font-semibold text-slate-400 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
                    Real-time
                </span>
            </div>

            {/* Feed List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {activities.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="text-sm font-medium">No recent activity</p>
                        <p className="text-xs">Waiting for new punches...</p>
                    </div>
                ) : (
                    activities.map((log) => {
                        const isCheckIn = log.punch.type === 'IN';
                        return (
                            <div
                                key={log._id}
                                className="group flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all duration-200"
                            >
                                {/* Avatar */}
                                <div className={`
                  w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm
                  ${isCheckIn ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
                `}>
                                    {getInitials(log.employee.name)}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <h4 className="text-sm font-bold text-slate-900 truncate">
                                            {log.employee.name}
                                        </h4>
                                        <span className="text-xs font-bold text-slate-500 font-mono">
                                            {formatTime(log.timestamp)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs">
                                        <span className={`
                      px-1.5 py-0.5 rounded-md font-semibold tracking-wide uppercase
                      ${isCheckIn
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                : 'bg-amber-50 text-amber-600 border border-amber-100'}
                    `}>
                                            {log.punch.subType || log.punch.type || 'PUNCH'}
                                        </span>
                                        <span className="text-slate-400 truncate max-w-[120px]">
                                            {log.employee.department}
                                        </span>
                                    </div>
                                </div>

                                {/* Shift Indicator (Subtle) */}
                                {log.shift.name && (
                                    <div className="hidden sm:block text-right">
                                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                                            {log.shift.name}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer / Status */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    System Online • Syncing with Biometric Devices
                </p>
            </div>
        </div>
    );
}
