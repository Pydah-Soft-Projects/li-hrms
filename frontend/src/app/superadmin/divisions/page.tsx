'use client';

import { useState, useEffect } from 'react';
import { api, Division, Department, Designation, Shift } from '@/lib/api';
import Spinner from '@/components/Spinner';

interface Manager {
    _id: string;
    name: string;
    email: string;
}

interface Manager {
    _id: string;
    name: string;
    email: string;
}

export default function DivisionsPage() {
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [managers, setManagers] = useState<Manager[]>([]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Division form state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showEditDialog, setShowEditDialog] = useState<Division | null>(null);
    const [showLinkDeptDialog, setShowLinkDeptDialog] = useState<Division | null>(null);
    const [showShiftDialog, setShowShiftDialog] = useState<Division | null>(null);

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [description, setDescription] = useState('');
    const [managerId, setManagerId] = useState('');
    const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
    const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);

    // Hierarchical Shift Assignment State
    const [targetScope, setTargetScope] = useState<'division' | 'department' | 'designation'>('division');
    const [targetDeptId, setTargetDeptId] = useState('');
    const [targetDesigId, setTargetDesigId] = useState('');
    const [designations, setDesignations] = useState<Designation[]>([]); // For the selected department

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [divRes, deptRes, shiftRes, managerRes] = await Promise.all([
                api.getDivisions(),
                api.getDepartments(true), // Fetch populated departments with designations
                api.getShifts(),
                api.getUsers({ role: 'manager' })
            ]);

            if (divRes.success) setDivisions(divRes.data || []);
            if (deptRes.success) setDepartments(deptRes.data || []);
            if (shiftRes.success) setShifts(shiftRes.data || []);
            if (managerRes.success) setManagers(managerRes.data || []);
        } catch (err) {
            console.error('Error loading division data:', err);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    // Update designations list when department is selected
    useEffect(() => {
        if (targetDeptId) {
            const dept = departments.find(d => d._id === targetDeptId);
            if (dept && dept.designations) {
                // Filter out string references, keep only populated Designation objects
                setDesignations(dept.designations.filter((d): d is Designation => typeof d !== 'string'));
            } else {
                setDesignations([]);
            }
        } else {
            setDesignations([]);
        }
    }, [targetDeptId, departments]);

    // Fetch existing shift assignments when scope/target changes
    useEffect(() => {
        if (!showShiftDialog) return;

        const loadExistingShifts = async () => {
            let existingShifts: string[] = [];
            const divisionId = showShiftDialog._id;

            if (targetScope === 'division') {
                // Load division defaults
                existingShifts = showShiftDialog.shifts?.map(s => typeof s === 'string' ? s : s._id) || [];
            }
            else if (targetScope === 'department' && targetDeptId) {
                // Load department overrides for this division
                const dept = departments.find(d => d._id === targetDeptId);
                if (dept && dept.divisionDefaults) {
                    const defaultForDiv = dept.divisionDefaults.find(dd => dd.division === divisionId || (dd.division as any)?._id === divisionId);
                    if (defaultForDiv && defaultForDiv.shifts) {
                        existingShifts = defaultForDiv.shifts.map(s => typeof s === 'string' ? s : s._id);
                    }
                }
            }
            else if (targetScope === 'designation' && targetDesigId && targetDeptId) {
                // Load designation overrides for this department AND division
                try {
                    setLoading(true); // Reuse loading or use local loading? Local is better for UI responsiveness, but reusing main for simplicity
                    const res = await api.getDesignation(targetDesigId);
                    if (res.success && res.data) {
                        const des = res.data as Designation;
                        if (des.departmentShifts) {
                            const shiftConfig = des.departmentShifts.find(ds =>
                                (ds.division?.toString() === divisionId || (ds.division as any)?._id === divisionId) &&
                                (ds.department?.toString() === targetDeptId || (ds.department as any)?._id === targetDeptId)
                            );
                            if (shiftConfig) {
                                // Extract IDs. If populated (unlikely from this endpoint but possible), map to ID.
                                existingShifts = shiftConfig.shifts.map((s: any) => typeof s === 'string' ? s : s._id);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error fetching designation shifts", err);
                } finally {
                    setLoading(false);
                }
            }

            setSelectedShiftIds(existingShifts);
        };

        loadExistingShifts();
    }, [targetScope, targetDeptId, targetDesigId, showShiftDialog, departments]);

    const handleCreateDivision = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload: Partial<Division> = { name, code, description };
            if (managerId) payload.manager = managerId as any;
            const res = await api.createDivision(payload);
            if (res.success) {
                setShowCreateDialog(false);
                resetForm();
                loadData();
            } else {
                setError(res.message || 'Failed to create division');
            }
        } catch (err) {
            console.error('Create error:', err);
            setError('An error occurred');
        }
    };

    const handleUpdateDivision = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showEditDialog) return;
        try {
            const payload: Partial<Division> = { name, code, description };
            if (managerId) payload.manager = managerId as any;
            const res = await api.updateDivision(showEditDialog._id, payload);
            if (res.success) {
                setShowEditDialog(null);
                resetForm();
                loadData();
            } else {
                setError(res.message || 'Failed to update division');
            }
        } catch (err) {
            console.error('Update error:', err);
            setError('An error occurred');
        }
    };

    const handleLinkDepartments = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showLinkDeptDialog) return;
        try {
            const res = await api.linkDepartmentsToDivision(showLinkDeptDialog._id, { departmentIds: selectedDeptIds, action: 'link' });
            if (res.success) {
                setShowLinkDeptDialog(null);
                loadData();
            } else {
                setError(res.message || 'Failed to link departments');
            }
        } catch (err) {
            console.error('Link error:', err);
            setError('An error occurred');
        }
    };

    const handleAssignShifts = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showShiftDialog) return;

        const payload: { shifts: string[]; targetType?: string; targetId?: string | { designationId: string; departmentId: string } } = { shifts: selectedShiftIds };

        if (targetScope === 'division') {
            payload.targetType = 'division_general';
        } else if (targetScope === 'department') {
            if (!targetDeptId) {
                setError('Please select a department');
                return;
            }
            payload.targetType = 'department_in_division';
            payload.targetId = targetDeptId;
        } else if (targetScope === 'designation') {
            if (!targetDeptId) {
                setError('Please select a department');
                return;
            }
            if (!targetDesigId) {
                setError('Please select a designation');
                return;
            }
            // Case 4: Designation in Department in Division
            payload.targetType = 'designation_in_dept_in_div';
            payload.targetId = {
                designationId: targetDesigId,
                departmentId: targetDeptId
            };
        }

        try {
            // Assert payload properties as they are definitely assigned above
            const res = await api.assignShiftsToDivision(showShiftDialog._id, payload as any);
            if (res.success) {
                setShowShiftDialog(null);
                loadData();
            } else {
                setError(res.message || 'Failed to assign shifts');
            }
        } catch (err) {
            console.error('Assign error:', err);
            setError('An error occurred');
        }
    };

    const handleDeleteDivision = async (id: string) => {
        if (!confirm('Are you sure you want to delete this division?')) return;
        try {
            const res = await api.deleteDivision(id);
            if (res.success) {
                loadData();
            } else {
                alert(res.message || 'Failed to delete division');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const resetForm = () => {
        setName('');
        setCode('');
        setDescription('');
        setManagerId('');
        setError('');
    };

    const resetShiftForm = () => {
        setTargetScope('division');
        setTargetDeptId('');
        setTargetDesigId('');
        setSelectedShiftIds([]);
        setError('');
    };

    const openShiftDialog = (div: Division) => {
        setShowShiftDialog(div);
        resetShiftForm();
        // Pre-select current division defaults (only for division scope initially)
        setSelectedShiftIds(div.shifts?.map(s => typeof s === 'string' ? s : s._id) || []);
    };

    if (loading && divisions.length === 0) return <div className="p-8"><Spinner /></div>;

    return (
        <div className="relative min-h-screen">
            <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
            <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/40 via-indigo-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

            <div className="relative z-10 p-6 sm:p-8 lg:p-10">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-5 shadow-[0_8px_26px_rgba(30,64,175,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90 sm:px-8">
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl">Division Management</h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage organizational units and their hierarchies</p>
                    </div>
                    <button
                        onClick={() => { resetForm(); setShowCreateDialog(true); }}
                        className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40"
                    >
                        <span className="text-lg">+</span>
                        <span>Create Division</span>
                    </button>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {divisions.map((div) => (
                        <div key={div._id} className="group relative rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-md backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/80">
                            <div className="mb-4 flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{div.name}</h3>
                                    <span className="inline-block rounded-lg bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">{div.code}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setShowEditDialog(div); setName(div.name); setCode(div.code); setDescription(div.description || ''); setManagerId(typeof div.manager === 'string' ? div.manager : div.manager?._id || ''); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"><EditIcon /></button>
                                    <button onClick={() => handleDeleteDivision(div._id)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"><TrashIcon /></button>
                                </div>
                            </div>

                            {div.description && <p className="mb-4 text-sm text-slate-500 line-clamp-2">{div.description}</p>}

                            <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <UserIcon /> <span className="font-medium">Manager:</span> {div.manager ? div.manager.name : 'Not Assigned'}
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    <button
                                        onClick={() => { setShowLinkDeptDialog(div); setSelectedDeptIds(div.departments?.map(d => typeof d === 'string' ? d : d._id) || []); }}
                                        className="rounded-lg bg-indigo-50 px-3 py-2 font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400"
                                    >
                                        {div.departments?.length || 0} Departments
                                    </button>
                                    <button
                                        onClick={() => openShiftDialog(div)}
                                        className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
                                    >
                                        Assign Shifts
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Create/Edit Dialog */}
                {(showCreateDialog || showEditDialog) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowCreateDialog(false); setShowEditDialog(null); resetForm(); }} />
                        <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                            <h2 className="text-xl font-semibold mb-6">{showEditDialog ? 'Edit Division' : 'Create Division'}</h2>
                            <form onSubmit={showEditDialog ? handleUpdateDivision : handleCreateDivision} className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Name *</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Code *</label>
                                    <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Description</label>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" rows={3} />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Division Manager (Optional)</label>
                                    <select value={managerId} onChange={e => setManagerId(e.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                        <option value="">Select Manager (Optional)</option>
                                        {managers.map(user => <option key={user._id} value={user._id}>{user.name} ({user.email})</option>)}
                                    </select>
                                </div>
                                {error && <p className="text-sm text-red-500">{error}</p>}
                                <div className="flex gap-3 pt-2">
                                    <button type="submit" className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700">{showEditDialog ? 'Update' : 'Create'}</button>
                                    <button type="button" onClick={() => { setShowCreateDialog(false); setShowEditDialog(null); resetForm(); }} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Link Departments Dialog */}
                {showLinkDeptDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLinkDeptDialog(null)} />
                        <div className="relative z-50 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                            <h2 className="text-xl font-semibold mb-6">Link Departments to {showLinkDeptDialog.name}</h2>
                            <form onSubmit={handleLinkDepartments} className="space-y-4">
                                <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-100 p-2 dark:border-slate-800">
                                    {departments.map(dept => (
                                        <label key={dept._id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={selectedDeptIds.includes(dept._id)}
                                                onChange={() => setSelectedDeptIds(prev => prev.includes(dept._id) ? prev.filter(id => id !== dept._id) : [...prev, dept._id])}
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                            />
                                            <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{dept.name} <span className="text-xs text-slate-400">({dept.code})</span></span>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button type="submit" className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/30">Save Selection</button>
                                    <button type="button" onClick={() => setShowLinkDeptDialog(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Assign Shifts Dialog */}
                {showShiftDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowShiftDialog(null)} />
                        <div className="relative z-50 w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
                            <h2 className="text-xl font-semibold mb-4">Assign Shifts - {showShiftDialog.name}</h2>

                            <form onSubmit={handleAssignShifts} className="space-y-4">
                                {/* Scope Selector */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Target Scope</label>
                                    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                        {(['division', 'department', 'designation'] as const).map((scope) => (
                                            <button
                                                key={scope}
                                                type="button"
                                                onClick={() => { setTargetScope(scope); setSelectedShiftIds([]); }}
                                                className={`flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-all ${targetScope === scope
                                                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                                    }`}
                                            >
                                                {scope}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-500">
                                        {targetScope === 'division' && "Default shifts for everyone in this Division."}
                                        {targetScope === 'department' && "Override shifts for a specific Department within this Division."}
                                        {targetScope === 'designation' && "Override shifts for a specific Designation within a Department."}
                                    </p>
                                </div>

                                {/* Dynamic Selectors */}
                                {targetScope !== 'division' && (
                                    <div>
                                        <label className="mb-2 block text-sm font-medium">Select Department</label>
                                        <select
                                            value={targetDeptId}
                                            onChange={e => setTargetDeptId(e.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                                            required
                                        >
                                            <option value="">-- Choose Department --</option>
                                            {/* Show only linked departments for this division */}
                                            {showShiftDialog.departments?.map((d: any) => {
                                                const deptDetails = departments.find(dept => dept._id === (typeof d === 'string' ? d : d._id));
                                                return deptDetails ? (
                                                    <option key={deptDetails._id} value={deptDetails._id}>{deptDetails.name}</option>
                                                ) : null;
                                            })}
                                        </select>
                                    </div>
                                )}

                                {targetScope === 'designation' && targetDeptId && (
                                    <div>
                                        <label className="mb-2 block text-sm font-medium">Select Designation</label>
                                        <select
                                            value={targetDesigId}
                                            onChange={e => setTargetDesigId(e.target.value)}
                                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                                            required
                                        >
                                            <option value="">-- Choose Designation --</option>
                                            {designations.map(desig => (
                                                <option key={desig._id} value={desig._id}>{desig.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-100 p-2 dark:border-slate-800">
                                    <label className="mb-2 block px-2 text-xs font-semibold uppercase text-slate-500">Select Shifts</label>
                                    {shifts.map(shift => (
                                        <label key={shift._id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={selectedShiftIds.includes(shift._id)}
                                                onChange={() => setSelectedShiftIds(prev => prev.includes(shift._id) ? prev.filter(id => id !== shift._id) : [...prev, shift._id])}
                                                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{shift.name}</div>
                                                <div className="text-[10px] text-slate-500">{shift.startTime} - {shift.endTime} ({shift.duration} mins)</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                {error && <p className="text-sm text-red-500">{error}</p>}

                                <div className="flex gap-3 pt-4">
                                    <button type="submit" className="flex-1 rounded-2xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700 shadow-lg shadow-amber-500/30">
                                        Save Assignments
                                    </button>
                                    <button type="button" onClick={() => setShowShiftDialog(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Re-using icons from User page
const EditIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const UserIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);
