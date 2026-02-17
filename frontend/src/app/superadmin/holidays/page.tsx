'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Holiday, HolidayGroup, Division, Department } from '@/lib/api';
import { toast } from 'react-toastify';
import Swal from 'sweetalert2';
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
import { ChevronLeft, ChevronRight, Plus, Users, Trash2 } from 'lucide-react';

export default function HolidayManagementPage() {
    const [activeTab, setActiveTab] = useState<'master' | 'groups'>('master');
    const [loading, setLoading] = useState(true);
    const [allHolidays, setAllHolidays] = useState<Holiday[]>([]);
    const [groups, setGroups] = useState<HolidayGroup[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string>('GLOBAL');

    // Form States
    const [showHolidayForm, setShowHolidayForm] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [editingGroup, setEditingGroup] = useState<HolidayGroup | null>(null);
    const [prefilledDate, setPrefilledDate] = useState<string | null>(null);
    const [applicableTo, setApplicableTo] = useState<"ALL" | "SPECIFIC_GROUPS">("ALL");

    useEffect(() => {
        if (showHolidayForm) {
            setApplicableTo(editingHoliday?.applicableTo || 'ALL');
        }
    }, [showHolidayForm, editingHoliday]);

    // Filter Date/Year
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const selectedYear = currentMonth.getFullYear();

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.getAllHolidaysAdmin(selectedYear);
            if (response.success && response.data) {
                setAllHolidays(response.data.holidays);
                setGroups(response.data.groups);
            }
        } catch (err) {
            console.error('Error loading holidays:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    const loadDivisionsAndDepartments = useCallback(async () => {
        try {
            const [divRes, deptRes] = await Promise.all([
                api.getDivisions(),
                api.getDepartments()
            ]);
            if (divRes.success) setDivisions(divRes.data || []);
            if (deptRes.success) setDepartments(deptRes.data || []);
        } catch (err) {
            console.error('Error loading metadata:', err);
        }
    }, []);

    useEffect(() => {
        loadData();
        loadDivisionsAndDepartments();
    }, [loadData, loadDivisionsAndDepartments]);

    const handleDeleteHoliday = async (id: string) => {
        const holiday = allHolidays.find(h => h._id === id);
        const isGroupView = selectedGroupId !== 'GLOBAL';

        if (isGroupView && holiday?.scope === 'GLOBAL') {
            alert('You cannot delete a Global holiday from a Group view. Please edit the Global calendar to remove it, or use an override to mark it as a working day (feature coming soon).');
            return;
        }

        if (!confirm('Are you sure you want to delete this holiday?')) return;
        try {
            await api.deleteHoliday(id);
            loadData();
        } catch (err) {
            console.error('Error deleting holiday:', err);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (!confirm('Are you sure you want to delete this group?')) return;
        try {
            const response = await api.deleteHolidayGroup(id);
            if (response.success) {
                loadData();
            } else {
                alert(response.message);
            }
        } catch (err) {
            console.error('Error deleting group:', err);
        }
    };

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

    const currentHolidays = useMemo(() => {
        if (selectedGroupId === 'GLOBAL') {
            return allHolidays.filter(h => h.scope === 'GLOBAL');
        } else {
            // With Propagation Logic, we don't need to merge Global holidays manually.
            // The Group copies already exist in the database.
            return allHolidays.filter(h =>
                (h.scope === 'GROUP' && (h.groupId && typeof h.groupId === 'object' ? h.groupId._id : h.groupId) === selectedGroupId)
            );
        }
    }, [allHolidays, selectedGroupId]);

    const getHolidaysForDate = (date: Date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return currentHolidays.filter(h => {
            const hDate = typeof h.date === 'string' ? parseISO(h.date) : new Date(h.date);
            const startDateStr = format(hDate, 'yyyy-MM-dd');

            if (h.endDate) {
                const hEndDate = typeof h.endDate === 'string' ? parseISO(h.endDate) : new Date(h.endDate);
                const endDateStr = format(hEndDate, 'yyyy-MM-dd');
                return dateStr >= startDateStr && dateStr <= endDateStr;
            }

            return startDateStr === dateStr;
        });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Holiday Calendar</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage master holidays and group-specific calendars</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('master')}
                            className={`whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${activeTab === 'master'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                }`}
                        >
                            Calendar View
                        </button>
                        <button
                            onClick={() => setActiveTab('groups')}
                            className={`whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-medium transition-colors ${activeTab === 'groups'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                }`}
                        >
                            Holiday Groups
                        </button>
                    </nav>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Spinner />
                    </div>
                ) : (
                    <div>
                        {activeTab === 'master' ? (
                            <div className="space-y-6">
                                {/* Calendar Header */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">View:</span>
                                            <select
                                                value={selectedGroupId}
                                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="GLOBAL">Global Calendar</option>
                                                {groups.map(g => (
                                                    <option key={g._id} value={g._id}>{g.name} (Group)</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>
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

                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        <button
                                            onClick={() => {
                                                setEditingHoliday(null);
                                                setPrefilledDate(null);
                                                setShowHolidayForm(true);
                                            }}
                                            className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Add Holiday
                                        </button>
                                    </div>
                                </div>

                                {/* Calendar Grid */}
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                    <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                            <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest">
                                                {day}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 border-slate-200 dark:border-slate-700">
                                        {calendarDays.map((date, idx) => {
                                            const holidays = getHolidaysForDate(date);
                                            const isCurrentMonth = isSameMonth(date, currentMonth);
                                            const isTodayDate = isToday(date);

                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => {
                                                        if (holidays.length === 0) {
                                                            setPrefilledDate(format(date, 'yyyy-MM-dd'));
                                                            setEditingHoliday(null);
                                                            setShowHolidayForm(true);
                                                        }
                                                    }}
                                                    className={`min-h-[120px] p-2 border-b border-r last:border-r-0 border-slate-100 dark:border-slate-700 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer ${!isCurrentMonth ? 'bg-slate-50/30 text-slate-300 dark:bg-slate-900/10 dark:text-slate-600' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${isTodayDate
                                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                                                            : isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'
                                                            }`}>
                                                            {format(date, 'd')}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-1 overflow-y-auto max-h-[80px] scrollbar-hide">
                                                        {holidays.map(h => (
                                                            <div
                                                                key={h._id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingHoliday(h);
                                                                    setPrefilledDate(null);
                                                                    setShowHolidayForm(true);
                                                                }}
                                                                className={`group relative flex flex-col rounded-lg border px-2 py-1.5 transition-all hover:ring-2 hover:ring-blue-400/30 cursor-pointer ${h.type === 'National' ? 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400' :
                                                                    h.type === 'Regional' ? 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' :
                                                                        h.type === 'Optional' ? 'bg-purple-50 border-purple-100 text-purple-700 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400' :
                                                                            'bg-orange-50 border-orange-100 text-orange-700 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400'
                                                                    }`}
                                                            >
                                                                <span className="text-[10px] font-bold uppercase tracking-tight truncate leading-tight">
                                                                    {h.name}
                                                                </span>
                                                                <div className="flex items-center justify-between gap-1 overflow-hidden">
                                                                    <span className="text-[8px] opacity-80 font-medium truncate">
                                                                        {h.type}
                                                                    </span>
                                                                    {h.sourceHolidayId && (
                                                                        <span className={`text-[7px] font-bold px-1 rounded uppercase ${h.isSynced !== false ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'}`}>
                                                                            {h.isSynced !== false ? 'Global' : 'Global (Mod)'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => {
                                            setEditingGroup(null);
                                            setShowGroupForm(true);
                                        }}
                                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Create Holiday Group
                                    </button>
                                </div>

                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                    {groups.map((group) => (
                                        <div key={group._id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                            <div className="mb-4 flex items-start justify-between">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{group.name}</h3>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{group.description || 'No description'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingGroup(group);
                                                            setShowGroupForm(true);
                                                        }}
                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteGroup(group._id)}
                                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-auto space-y-3">
                                                <div className="mt-1 space-y-1">
                                                    {(group.divisionMapping || []).map((map, idx: number) => (
                                                        <div key={idx} className="flex flex-wrap items-center gap-1 text-[11px] bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-100 dark:border-slate-700">
                                                            <span className="font-bold text-slate-700 dark:text-slate-300">
                                                                {typeof map.division === 'object' ? map.division.name : 'Division'}
                                                            </span>
                                                            <span className="text-slate-400">→</span>
                                                            <span className="text-blue-600 dark:text-blue-400">
                                                                {map.departments && map.departments.length > 0 ? (
                                                                    map.departments.map((d, i: number) => (
                                                                        <span key={i}>
                                                                            {typeof d === 'object' ? d.name : 'Dept'}
                                                                            {i < map.departments.length - 1 ? ', ' : ''}
                                                                        </span>
                                                                    ))
                                                                ) : 'All Departments'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setSelectedGroupId(group._id);
                                                    setActiveTab('master');
                                                }}
                                                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded-xl transition-all"
                                            >
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                View Group Calendar
                                            </button>
                                        </div>
                                    ))}
                                    {groups.length === 0 && (
                                        <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
                                            <p className="text-slate-500 dark:text-slate-400">No holiday groups created yet.</p>
                                            <button
                                                onClick={() => setShowGroupForm(true)}
                                                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                                            >
                                                Create your first group
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Holiday Form Modal */}
            {
                showHolidayForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    {editingHoliday ? 'Edit Holiday' : (selectedGroupId === 'GLOBAL' ? 'Add Global Holiday' : `Add Holiday to ${groups.find(g => g._id === selectedGroupId)?.name}`)}
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowHolidayForm(false);
                                        setPrefilledDate(null);
                                    }}
                                    className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const isGlobalContext = editingHoliday ? editingHoliday.scope === 'GLOBAL' : selectedGroupId === 'GLOBAL';
                                const isCreatingOverride = !isGlobalContext && editingHoliday?.scope === 'GLOBAL';
                                const applicableTo = isGlobalContext ? (formData.get('applicableTo') as "ALL" | "SPECIFIC_GROUPS") : 'SPECIFIC_GROUPS';

                                const data: Partial<Holiday> & { isMaster: boolean, scope: string, applicableTo: string, groupId?: string, targetGroupIds?: string[], endDate?: string, overridesMasterId?: string } = {
                                    name: formData.get('name') as string,
                                    date: formData.get('date') as string,
                                    endDate: formData.get('endDate') as string || undefined,
                                    type: formData.get('type') as any,
                                    description: formData.get('description') as string,
                                    isMaster: isGlobalContext,
                                    scope: isGlobalContext ? 'GLOBAL' : 'GROUP',
                                    applicableTo,
                                    groupId: isGlobalContext ? undefined : (selectedGroupId !== 'GLOBAL' ? selectedGroupId : (editingHoliday?.groupId as string)),
                                    targetGroupIds: isGlobalContext && applicableTo === 'SPECIFIC_GROUPS' ? formData.getAll('targetGroupIds') as string[] : undefined
                                };

                                if (editingHoliday) {
                                    if (isCreatingOverride) {
                                        // Creating a NEW override record, do not send _id
                                        data.overridesMasterId = editingHoliday._id;
                                    } else {
                                        data._id = editingHoliday._id;
                                    }
                                }


                                try {
                                    await api.saveHoliday(data);
                                    setShowHolidayForm(false);
                                    setPrefilledDate(null);
                                    loadData();
                                } catch (err: any) {
                                    console.error(err);
                                    alert(err.message || 'Failed to save holiday');
                                }
                            }} className="flex flex-col">
                                <div className="grid grid-cols-1 md:grid-cols-3">
                                    {/* Left Panel: Details */}
                                    <div className="md:col-span-2 p-8 space-y-6">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Event Title</label>
                                            <input
                                                type="text"
                                                name="name"
                                                defaultValue={editingHoliday?.name}
                                                required
                                                placeholder="e.g., Annual Company Retreat"
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Type</label>
                                            <select
                                                name="type"
                                                defaultValue={editingHoliday?.type || 'National'}
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="National">National Holiday</option>
                                                <option value="Regional">Regional Holiday</option>
                                                <option value="Optional">Optional Holiday</option>
                                                <option value="Company">Company Holiday</option>
                                                <option value="Academic">Academic Event</option>
                                                <option value="Observance">Observance</option>
                                                <option value="Seasonal">Seasonal</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Start Date *</label>
                                                <input
                                                    type="date"
                                                    name="date"
                                                    defaultValue={editingHoliday?.date ? new Date(editingHoliday.date).toISOString().split('T')[0] : (prefilledDate || '')}
                                                    required
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">End Date (Optional)</label>
                                                <input
                                                    type="date"
                                                    name="endDate"
                                                    defaultValue={editingHoliday?.endDate ? new Date(editingHoliday.endDate).toISOString().split('T')[0] : ''}
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                                    placeholder="dd-mm-yyyy"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Start Time (Optional)</label>
                                                <input
                                                    type="time"
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">End Time (Optional)</label>
                                                <input
                                                    type="time"
                                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                                            <textarea
                                                name="description"
                                                defaultValue={editingHoliday?.description}
                                                rows={3}
                                                placeholder="Provide additional details about the holiday..."
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Right Panel: Target Audience */}
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-8 border-l border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-6">
                                            <Users className="h-5 w-5 text-slate-500" />
                                            <h3 className="text-sm font-bold tracking-wider text-slate-900 dark:text-white uppercase">Target Audience</h3>
                                        </div>

                                        <div className="space-y-6">
                                            {(editingHoliday ? editingHoliday.scope === 'GLOBAL' : selectedGroupId === 'GLOBAL') ? (
                                                <>
                                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                                        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                                                            Leave fields empty to target everyone globally, or select specific groups below.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="radio"
                                                                name="applicableTo"
                                                                value="ALL"
                                                                id="app-all"
                                                                checked={applicableTo === 'ALL'}
                                                                onChange={() => setApplicableTo('ALL')}
                                                                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                            />
                                                            <label htmlFor="app-all" className="text-sm font-medium text-slate-700 dark:text-slate-300">Target All Employees</label>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="radio"
                                                                name="applicableTo"
                                                                value="SPECIFIC_GROUPS"
                                                                id="app-specific"
                                                                checked={applicableTo === 'SPECIFIC_GROUPS'}
                                                                onChange={() => setApplicableTo('SPECIFIC_GROUPS')}
                                                                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                                                            />
                                                            <label htmlFor="app-specific" className="text-sm font-medium text-slate-700 dark:text-slate-300">Target Specific Groups</label>
                                                        </div>

                                                        <div className={`mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar transition-opacity duration-300 ${applicableTo === 'ALL' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                                            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Holiday Groups</label>
                                                            {groups.map(g => (
                                                                <label key={g._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                                                                    <input
                                                                        type="checkbox"
                                                                        name="targetGroupIds"
                                                                        value={g._id}
                                                                        defaultChecked={editingHoliday?.targetGroupIds?.some(tg => (typeof tg === 'object' ? tg._id : tg) === g._id)}
                                                                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                                                                    />
                                                                    <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{g.name}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="space-y-6">
                                                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800">
                                                        <h4 className="text-xs font-bold text-orange-700 dark:text-orange-400 mb-1">Group Context</h4>
                                                        <p className="text-[11px] text-orange-600 dark:text-orange-500 leading-normal">
                                                            This holiday is exclusive to <strong>{groups.find(g => g._id === (editingHoliday?.groupId as string || selectedGroupId))?.name}</strong>.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Applicable Divisions</label>
                                                        {groups.find(g => g._id === (editingHoliday?.groupId as string || selectedGroupId))?.divisionMapping.map((m, idx) => (
                                                            <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                                <div className="text-xs font-bold text-slate-900 dark:text-white">
                                                                    {typeof m.division === 'object' ? m.division.name : 'Selected Division'}
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                                                    {m.departments.length > 0 ? m.departments.map(d => typeof d === 'object' ? d.name : 'Dept').join(', ') : 'All Departments'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl">
                                    <div className="flex gap-4">
                                        {editingHoliday && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // With Propagation Logic, deleting from Group View is allowed.
                                                    // It will only delete the Group Copy (Opt-out), leaving Global intact.
                                                    Swal.fire({
                                                        title: 'Are you sure?',
                                                        text: selectedGroupId !== 'GLOBAL' && editingHoliday.scope === 'GROUP' && (editingHoliday.sourceHolidayId || editingHoliday.isMaster)
                                                            ? "This will remove this holiday from THIS group only. The Global holiday will remain."
                                                            : "You won't be able to revert this!",
                                                        icon: 'warning',
                                                        showCancelButton: true,
                                                        confirmButtonColor: '#ef4444',
                                                        cancelButtonColor: '#64748b',
                                                        confirmButtonText: 'Yes, delete it!',
                                                        backdrop: `rgba(0,0,0,0.4)`,
                                                        buttonsStyling: false,
                                                        customClass: {
                                                            popup: 'rounded-3xl shadow-xl border border-slate-100 dark:bg-slate-900 dark:border-slate-700',
                                                            title: 'text-lg font-bold text-slate-900 dark:text-white',
                                                            htmlContainer: 'text-sm text-slate-500 dark:text-slate-400',
                                                            confirmButton: 'px-5 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all shadow-lg shadow-red-500/30',
                                                            cancelButton: 'px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all',
                                                            actions: 'flex gap-3'
                                                        }
                                                    }).then((result) => {
                                                        if (result.isConfirmed) {
                                                            handleDeleteHoliday(editingHoliday._id);
                                                            setShowHolidayForm(false);
                                                        }
                                                    });
                                                }}
                                                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Delete Event
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowHolidayForm(false);
                                                setPrefilledDate(null);
                                            }}
                                            className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            {editingHoliday ? (
                                                selectedGroupId !== 'GLOBAL' && editingHoliday.scope === 'GLOBAL' ? 'Create Override' : 'Update Event'
                                            ) : 'Create Event'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Group Form Modal */}
            {
                showGroupForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                    {editingGroup ? 'Edit Holiday Group' : 'Create Holiday Group'}
                                </h2>
                                <button
                                    onClick={() => setShowGroupForm(false)}
                                    className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <HolidayGroupForm
                                editing={editingGroup}
                                divisions={divisions}
                                departments={departments}
                                onClose={() => setShowGroupForm(false)}
                                onSave={() => {
                                    setShowGroupForm(false);
                                    loadData();
                                }}
                            />
                        </div>
                    </div>
                )
            }
        </div >
    );
}

function HolidayGroupForm({ editing, divisions, departments, onClose, onSave }: {
    editing: HolidayGroup | null;
    divisions: Division[];
    departments: Department[];
    onClose: () => void;
    onSave: () => void;
}) {
    const [name, setName] = useState(editing?.name || '');
    const [description, setDescription] = useState(editing?.description || '');
    const [mapping, setMapping] = useState<{ division: string; departments: string[] }[]>(
        editing?.divisionMapping?.map(m => ({
            division: typeof m.division === 'object' ? m.division._id : m.division,
            departments: m.departments.map(d => typeof d === 'object' ? d._id : d)
        })) || [{ division: '', departments: [] }]
    );

    const addMapping = () => setMapping([...mapping, { division: '', departments: [] }]);
    const removeMapping = (idx: number) => setMapping(mapping.filter((_, i) => i !== idx));

    const updateMapping = (idx: number, field: 'division' | 'departments', value: any) => {
        const newMapping = [...mapping];
        newMapping[idx] = { ...newMapping[idx], [field]: value };
        setMapping(newMapping);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = {
                _id: editing?._id,
                name,
                description,
                divisionMapping: mapping.filter(m => m.division),
                isActive: true
            };
            await api.saveHolidayGroup(data);
            onSave();
        } catch (err: any) {
            console.error(err);
            const errorMessage = err.response?.data?.message || err.message || 'Failed to save group';
            toast.error(errorMessage);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Group Name *</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                />
            </div>

            <div className="pt-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Division & Department Mappings</h3>
                    <button
                        type="button"
                        onClick={addMapping}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-500 flex items-center gap-1"
                    >
                        <Plus className="h-3 w-3" /> Add Mapping
                    </button>
                </div>

                <div className="space-y-4">
                    {mapping.map((m, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 relative">
                            {mapping.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeMapping(idx)}
                                    className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Division *</label>
                                    <select
                                        value={m.division}
                                        onChange={(e) => updateMapping(idx, 'division', e.target.value)}
                                        required
                                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    >
                                        <option value="">Select Division</option>
                                        {divisions.map(div => (
                                            <option key={div._id} value={div._id}>{div.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Departments</label>
                                        <label className="flex items-center gap-1.5 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={m.departments.length === 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        // "All Departments" checked -> Clear specific departments
                                                        updateMapping(idx, 'departments', []);
                                                    } else {
                                                        // "All Departments" unchecked -> Select first available department to exit "All" mode
                                                        const availableDepts = departments
                                                            .filter(dept => (dept.divisions || [])
                                                                .some((div: string | Division) => (typeof div === 'object' ? div._id : div) === m.division));

                                                        if (availableDepts.length > 0) {
                                                            updateMapping(idx, 'departments', [availableDepts[0]._id]);
                                                        }
                                                    }
                                                }}
                                                className="w-3.5 h-3.5 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                                            />
                                            <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-600 transition-colors uppercase">All Departments</span>
                                        </label>
                                    </div>
                                    <select
                                        multiple
                                        value={m.departments}
                                        disabled={m.departments.length === 0}
                                        onChange={(e) => {
                                            const values = Array.from(e.target.selectedOptions).map(opt => opt.value);
                                            updateMapping(idx, 'departments', values);
                                        }}
                                        className={`w-full h-24 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white transition-opacity ${m.departments.length === 0 ? 'opacity-50 grayscale-[0.5]' : 'opacity-100'}`}
                                    >
                                        {departments.filter(dept => (dept.divisions || []).some((div: string | Division) => (typeof div === 'object' ? div._id : div) === m.division)).map(dept => (
                                            <option key={dept._id} value={dept._id}>{dept.name}</option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                        {m.departments.length === 0 ? 'Currently targeting ALL departments in this division.' : 'Ctrl+Click to select multiple.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                >
                    {editing ? 'Update' : 'Create'} Group
                </button>
            </div>
        </form>
    );
}
