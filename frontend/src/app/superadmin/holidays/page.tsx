'use client';

import { useState, useEffect } from 'react';
import { api, Holiday, HolidayGroup, Division, Department } from '@/lib/api';
import Spinner from '@/components/Spinner';

export default function HolidayManagementPage() {
    const [activeTab, setActiveTab] = useState<'master' | 'groups'>('master');
    const [loading, setLoading] = useState(true);
    const [masterHolidays, setMasterHolidays] = useState<Holiday[]>([]);
    const [groups, setGroups] = useState<HolidayGroup[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);

    // Form States
    const [showHolidayForm, setShowHolidayForm] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [editingGroup, setEditingGroup] = useState<HolidayGroup | null>(null);

    // Filter Year
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    useEffect(() => {
        loadData();
        loadDivisionsAndDepartments();
    }, [selectedYear]);

    const loadData = async () => {
        try {
            setLoading(true);
            const response = await api.getAllHolidaysAdmin(selectedYear);
            if (response.success && response.data) {
                setMasterHolidays(response.data.holidays.filter(h => h.scope === 'GLOBAL'));
                setGroups(response.data.groups);
            }
        } catch (err) {
            console.error('Error loading holidays:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadDivisionsAndDepartments = async () => {
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
    };

    const handleDeleteHoliday = async (id: string) => {
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

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Holiday Calendar</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage master holidays and group-specific calendars</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                            {[selectedYear - 1, selectedYear, selectedYear + 1].map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
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
                            Master Calendar
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
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => {
                                            setEditingHoliday(null);
                                            setShowHolidayForm(true);
                                        }}
                                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                    >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Master Holiday
                                    </button>
                                </div>

                                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Holiday Name</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Applicability</th>
                                                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                                            {masterHolidays.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                                                        No master holidays found for {selectedYear}.
                                                    </td>
                                                </tr>
                                            ) : (
                                                masterHolidays.map((holiday) => (
                                                    <tr key={holiday._id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-200">
                                                            {new Date(holiday.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                                                        </td>
                                                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                                                            {holiday.name}
                                                        </td>
                                                        <td className="whitespace-nowrap px-6 py-4">
                                                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${holiday.type === 'National' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                                holiday.type === 'Regional' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                                    'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                                                                }`}>
                                                                {holiday.type}
                                                            </span>
                                                        </td>
                                                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                                            {holiday.applicableTo === 'ALL' ? 'All Groups' : `${holiday.targetGroupIds?.length || 0} Groups`}
                                                        </td>
                                                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingHoliday(holiday);
                                                                        setShowHolidayForm(true);
                                                                    }}
                                                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteHoliday(holiday._id)}
                                                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                                >
                                                                    Delete
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
                                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                                    <strong>Applicable To:</strong>
                                                    <ul className="mt-1 list-inside list-disc">
                                                        {group.divisionMapping.map((map: any, idx) => (
                                                            <li key={idx}>
                                                                {map.division?.name || 'Unknown Division'}
                                                                <span className="text-slate-400">
                                                                    ({map.departments.length > 0 ? `${map.departments.length} Depts` : 'All Depts'})
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
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
            {showHolidayForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {editingHoliday ? 'Edit Holiday' : 'Add Master Holiday'}
                            </h2>
                            <button
                                onClick={() => setShowHolidayForm(false)}
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
                            const data: any = {
                                name: formData.get('name'),
                                date: formData.get('date'),
                                type: formData.get('type'),
                                description: formData.get('description'),
                                isMaster: true,
                                scope: 'GLOBAL',
                                applicableTo: formData.get('applicableTo'),
                            };

                            if (editingHoliday) {
                                data._id = editingHoliday._id;
                            }

                            if (data.applicableTo === 'SPECIFIC_GROUPS') {
                                // Handle multi-select for groups if implemented
                                // For now, defaulting to empty or need a UI for it
                                const selectedGroups = Array.from(formData.getAll('targetGroupIds'));
                                data.targetGroupIds = selectedGroups;
                            }

                            try {
                                await api.saveHoliday(data);
                                setShowHolidayForm(false);
                                loadData();
                            } catch (err) {
                                console.error(err);
                                alert('Failed to save holiday');
                            }
                        }} className="p-6 space-y-4">

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Holiday Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    defaultValue={editingHoliday?.name}
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date *</label>
                                    <input
                                        type="date"
                                        name="date"
                                        defaultValue={editingHoliday?.date ? new Date(editingHoliday.date).toISOString().split('T')[0] : ''}
                                        required
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Type *</label>
                                    <select
                                        name="type"
                                        defaultValue={editingHoliday?.type || 'National'}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    >
                                        <option value="National">National</option>
                                        <option value="Regional">Regional</option>
                                        <option value="Optional">Optional</option>
                                        <option value="Company">Company</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Applicable To</label>
                                <select
                                    name="applicableTo"
                                    defaultValue={editingHoliday?.applicableTo || 'ALL'}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                >
                                    <option value="ALL">All Groups (Global)</option>
                                    <option value="SPECIFIC_GROUPS">Specific Groups Only</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    defaultValue={editingHoliday?.description}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowHolidayForm(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                >
                                    {editingHoliday ? 'Update' : 'Create'} Holiday
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Group Form Modal */}
            {showGroupForm && (
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

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);

                            // Construct Division Mapping
                            // This is a simplified version. A real UI would need a complex multi-select or repeating field.
                            // For MVP, we'll just take the first selection as a single mapping
                            const divisionId = formData.get('divisionId');
                            const departmentIds = Array.from(formData.getAll('departmentIds'));

                            const divisionMapping = [{
                                division: divisionId,
                                departments: departmentIds.length > 0 ? departmentIds : [] // Empty means all
                            }];

                            const data: any = {
                                name: formData.get('name'),
                                description: formData.get('description'),
                                divisionMapping,
                                isActive: true
                            };

                            if (editingGroup) {
                                data._id = editingGroup._id;
                            }

                            try {
                                await api.saveHolidayGroup(data);
                                setShowGroupForm(false);
                                loadData();
                            } catch (err) {
                                console.error(err);
                                alert('Failed to save group');
                            }
                        }} className="p-6 space-y-4">

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Group Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    defaultValue={editingGroup?.name}
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                    placeholder="e.g., Bangalore Support Team"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    defaultValue={editingGroup?.description}
                                    rows={2}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                />
                            </div>

                            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Scope Configuration</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Division *</label>
                                        <select
                                            name="divisionId"
                                            required
                                            defaultValue={editingGroup?.divisionMapping?.[0]?.division?._id || editingGroup?.divisionMapping?.[0]?.division}
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                        >
                                            <option value="">Select Division</option>
                                            {divisions.map(div => (
                                                <option key={div._id} value={div._id}>{div.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Departments (Optional)</label>
                                        <select
                                            name="departmentIds"
                                            multiple
                                            className="w-full h-32 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                                        >
                                            {departments.map(dept => (
                                                <option key={dept._id} value={dept._id}>{dept.name}</option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-slate-500">Hold Ctrl to select multiple. Leave empty for All Departments.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupForm(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                >
                                    {editingGroup ? 'Update' : 'Create'} Group
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
