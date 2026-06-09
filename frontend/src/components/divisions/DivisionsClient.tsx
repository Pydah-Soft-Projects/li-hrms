'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Division, Department, Designation, Shift, EmployeeGroup } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { collapseShiftRowsForEditor, expandShiftRowsForApi, type DivisionShiftSelectionRow } from '@/lib/shiftAssignmentGroups';
import {
    downloadDivisionsHierarchyExcel,
    downloadDivisionsHierarchyPdf,
} from '@/lib/divisionsHierarchyExport';
import {
    Plus,
    Pencil,
    Trash2,
    Building2,
    Clock,
    User as UserIcon,
    Search,
    Download,
    GitBranch,
    AlertTriangle,
} from 'lucide-react';
import {
    LoansPageShell,
    LoansPageHeader,
    LoansStatGrid,
    LoansContentPanel,
    LoansSectionTitle,
    loansPrimaryButtonClass,
    loansPrimaryButtonStyle,
    loansTableHeadClass,
    loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
    LoanDetailDialog,
    LoanDetailDialogHeader,
    LoanDetailDialogBody,
    LoanDialogFooter,
    LoanFormLabel,
    LoanFormPanel,
    loansDialogOutlineButtonClass,
    loansDialogOutlineButtonStyle,
    loansDialogPrimaryButtonClass,
    loansDialogPrimaryButtonStyle,
    loansDialogSecondaryButtonClass,
    loansDialogSecondaryButtonStyle,
    loansFormInputClass,
    loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerActionButtonClass, ledgerStatusBadgeClass } from '@/lib/ledgerUi';
import { alertConfirm } from '@/lib/customSwal';
import { showDeleteError, showDeleteSuccess } from '@/lib/assignedEmployeesDeleteSwal';

interface Manager {
    _id: string;
    name: string;
    email: string;
}

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

const ledgerOutlineBtn =
    'inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 transition hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900 sm:px-3 sm:py-2 sm:text-xs';

function DivRowActions({
    onEdit,
    onDelete,
    onShifts,
    className = '',
}: {
    onEdit: () => void;
    onDelete: () => void;
    onShifts?: () => void;
    className?: string;
}) {
    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {onShifts ? (
                <button type="button" onClick={onShifts} className={ledgerActionButtonClass('amber')} aria-label="Shifts">
                    <Clock className="h-3.5 w-3.5" />
                </button>
            ) : null}
            <button type="button" onClick={onEdit} className={ledgerActionButtonClass('sky')} aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => void onDelete()} className={ledgerActionButtonClass('rose')} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

function DivisionCard({
    div,
    workflowsBasePath,
    showWorkflowsLink = true,
    onEdit,
    onDelete,
    onLinkDepts,
    onShifts,
}: {
    div: Division;
    workflowsBasePath: string;
    showWorkflowsLink?: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onLinkDepts: () => void;
    onShifts: () => void;
}) {
    const initials = (div.code || div.name.substring(0, 2)).substring(0, 2).toUpperCase();
    const managerLabel = div.manager
        ? typeof div.manager === 'string'
            ? div.manager
            : (div.manager as { name?: string }).name || 'Vacant'
        : 'Vacant';

    return (
        <div
            className="group relative flex min-h-[220px] flex-col border bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-[var(--ps-accent-soft)] dark:bg-stone-950 sm:p-5"
            style={ledgerBorder}
        >
            <div className="mb-4 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                    <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border text-sm font-bold transition-transform group-hover:scale-105"
                        style={{
                            borderColor: 'var(--ps-accent-border)',
                            backgroundColor: 'var(--ps-accent-soft)',
                            color: 'var(--ps-accent)',
                        }}
                    >
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-stone-900 transition-colors group-hover:text-[var(--ps-accent)] dark:text-stone-100">
                            {div.name}
                        </h3>
                        {div.code ? (
                            <span className="mt-0.5 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-stone-500 dark:bg-stone-900">
                                {div.code}
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <DivRowActions onEdit={onEdit} onDelete={onDelete} />
                </div>
            </div>

            {div.description ? (
                <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                    {div.description}
                </p>
            ) : (
                <div className="mb-4 min-h-[2.5rem]" />
            )}

            <div className="mt-auto space-y-3">
                <div className="flex items-center gap-2 border p-2.5" style={ledgerBorder}>
                    <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white dark:bg-stone-950"
                        style={ledgerBorder}
                    >
                        <UserIcon className="h-3.5 w-3.5 text-stone-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-stone-400">Manager</p>
                        <p className="truncate text-xs font-semibold text-stone-700 dark:text-stone-200">{managerLabel}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onLinkDepts}
                        className="flex flex-col items-center justify-center border border-indigo-200 bg-indigo-50/60 p-2.5 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/30"
                    >
                        <span className="text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                            {div.departments?.length || 0}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-indigo-500">
                            <Building2 className="h-3 w-3" />
                            Depts
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={onShifts}
                        className="flex flex-col items-center justify-center border border-amber-200 bg-amber-50/60 p-2.5 transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
                    >
                        <span className="text-sm font-bold tracking-tight text-amber-600 dark:text-amber-400">Assign</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-amber-500">
                            <Clock className="h-3 w-3" />
                            Shifts
                        </span>
                    </button>
                </div>

                {showWorkflowsLink ? (
                    <Link
                        href={`${workflowsBasePath}/${div._id}/workflows`}
                        className="flex items-center justify-center gap-1.5 border border-violet-200 bg-violet-50/60 py-2 text-[10px] font-semibold uppercase tracking-widest text-violet-600 transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-400"
                    >
                        <GitBranch className="h-3 w-3" />
                        Workflows
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

export default function DivisionsClient({
    workflowsBasePath = '/superadmin/divisions',
    showWorkflowsLink = true,
}: {
    workflowsBasePath?: string;
    showWorkflowsLink?: boolean;
} = {}) {
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
    const [linkDeptSearch, setLinkDeptSearch] = useState('');
    const [linkConfirmData, setLinkConfirmData] = useState<{
        affectedDepartments: { departmentId: string; departmentName: string; employeeCount: number }[];
        safeUnlinkedCount: number;
        addedCount: number;
    } | null>(null);
    const [selectedShifts, setSelectedShifts] = useState<DivisionShiftSelectionRow[]>([]);
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
    const [customGroupingEnabled, setCustomGroupingEnabled] = useState(false);
    const [shiftSearch, setShiftSearch] = useState('');
    const [segmentShiftId, setSegmentShiftId] = useState<string>('');

    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

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
            const [divRes, deptRes, shiftRes, managerRes, groupRes, groupingSettingRes] = await Promise.all([
                api.getDivisions(),
                api.getDepartments(true), // Fetch populated departments with designations
                api.getShifts(),
                api.getUsers({ role: 'manager' }),
                api.getEmployeeGroups(true),
                api.getSetting('custom_employee_grouping_enabled'),
            ]);

            if (divRes.success) setDivisions(divRes.data || []);
            if (deptRes.success) setDepartments(deptRes.data || []);
            if (shiftRes.success) setShifts(shiftRes.data || []);
            if (managerRes.success) setManagers(managerRes.data || []);
            if (groupRes.success) setEmployeeGroups(groupRes.data || []);
            if (groupingSettingRes.success && groupingSettingRes.data) {
                setCustomGroupingEnabled(!!groupingSettingRes.data.value);
            }
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
            let existingShifts: { shiftId: string; gender: string; employee_group_id?: string | null; firstHalf?: any; break?: any; secondHalf?: any }[] = [];
            const divisionId = showShiftDialog._id;

            // Helper to parse Mixed backend response (string ID or Object with shiftId/gender)
            // Backend migration ensures objects, but we handle robustly.
            const parseShifts = (shifts: any[]) => {
                return (shifts || []).map(s => {
                    if (typeof s === 'string') return { shiftId: s, gender: 'All' }; // Should not happen after migration
                    // If it's the new object structure
                    if (s.shiftId) return {
                        shiftId: typeof s.shiftId === 'string' ? s.shiftId : s.shiftId._id,
                        gender: s.gender || 'All',
                        employee_group_id: s.employee_group_id
                            ? (typeof s.employee_group_id === 'string' ? s.employee_group_id : s.employee_group_id._id)
                            : null,
                        firstHalf: s.firstHalf ?? null,
                        break: s.break ?? null,
                        secondHalf: s.secondHalf ?? null,
                    };
                    // Fallback for old object structure (direct Shift object)
                    return { shiftId: s._id, gender: 'All' };
                });
            };

            if (targetScope === 'division') {
                // Load division defaults
                existingShifts = parseShifts(showShiftDialog.shifts || []);
            }
            else if (targetScope === 'department' && targetDeptId) {
                // Load department overrides for this division
                const dept = departments.find(d => d._id === targetDeptId);
                if (dept && dept.divisionDefaults) {
                    const defaultForDiv = dept.divisionDefaults.find(dd => dd.division === divisionId || (dd.division as any)?._id === divisionId);
                    if (defaultForDiv && defaultForDiv.shifts) {
                        existingShifts = parseShifts(defaultForDiv.shifts);
                    }
                }
            }
            else if (targetScope === 'designation' && targetDesigId && targetDeptId) {
                // Load designation overrides for this department AND division
                try {
                    setLoading(true);
                    const res = await api.getDesignation(targetDesigId);
                    if (res.success && res.data) {
                        const des = res.data as Designation;
                        if (des.departmentShifts) {
                            const shiftConfig = des.departmentShifts.find(ds =>
                                (ds.division?.toString() === divisionId || (ds.division as any)?._id === divisionId) &&
                                (ds.department?.toString() === targetDeptId || (ds.department as any)?._id === targetDeptId)
                            );
                            if (shiftConfig) {
                                existingShifts = parseShifts(shiftConfig.shifts);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error fetching designation shifts", err);
                } finally {
                    setLoading(false);
                }
            }

            setSelectedShifts(collapseShiftRowsForEditor(existingShifts));
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

    const handleLinkDepartments = async (e: React.FormEvent, force = false) => {
        e.preventDefault();
        if (!showLinkDeptDialog) return;
        try {
            const res = await api.linkDepartmentsToDivision(
                showLinkDeptDialog._id,
                { departmentIds: selectedDeptIds, action: 'set', force }
            );
            if (res.success) {
                setLinkConfirmData(null);
                setShowLinkDeptDialog(null);
                setLinkDeptSearch('');
                loadData();
            } else if ((res as any).requiresConfirmation) {
                setLinkConfirmData({
                    affectedDepartments: (res as any).affectedDepartments || [],
                    safeUnlinkedCount: (res as any).safeUnlinkedCount || 0,
                    addedCount: (res as any).addedCount || 0,
                });
            } else {
                setError(res.message || 'Failed to update departments');
            }
        } catch (err) {
            console.error('Link error:', err);
            setError('An error occurred');
        }
    };

    const handleForceUnlink = async () => {
        if (!showLinkDeptDialog) return;
        try {
            const res = await api.linkDepartmentsToDivision(
                showLinkDeptDialog._id,
                { departmentIds: selectedDeptIds, action: 'set', force: true }
            );
            if (res.success) {
                setLinkConfirmData(null);
                setShowLinkDeptDialog(null);
                setLinkDeptSearch('');
                loadData();
            } else {
                setError(res.message || 'Failed to update departments');
            }
        } catch (err) {
            console.error('Force unlink error:', err);
            setError('An error occurred');
        }
    };

    const handleAssignShifts = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showShiftDialog) return;

        const payload: { shifts: { shiftId: string; gender: string; employee_group_id?: string | null }[]; targetType?: string; targetId?: string | { designationId: string; departmentId: string } } = { shifts: expandShiftRowsForApi(selectedShifts) };

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
                setShiftSearch('');
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
        const { isConfirmed } = await alertConfirm(
            'Delete division?',
            'This action cannot be undone.',
            'Delete'
        );
        if (!isConfirmed) return;
        try {
            const res = await api.deleteDivision(id);
            if (res.success) {
                await showDeleteSuccess('Division');
                loadData();
            } else {
                await showDeleteError(res.message || 'Failed to delete division');
            }
        } catch (err) {
            console.error(err);
            await showDeleteError('An error occurred while deleting the division.');
        }
    };

    const divisionStats = useMemo(() => {
        const linkedDepts = divisions.reduce((acc, div) => acc + (div.departments?.length || 0), 0);
        return {
            total: divisions.length,
            linkedDepts,
            avgDepts: divisions.length ? Math.round(linkedDepts / divisions.length) : 0,
            withManager: divisions.filter((d) => d.manager).length,
        };
    }, [divisions]);

    const openEditDialog = (div: Division) => {
        setShowEditDialog(div);
        setName(div.name);
        setCode(div.code);
        setDescription(div.description || '');
        setManagerId(typeof div.manager === 'string' ? div.manager : div.manager?._id || '');
        setError('');
    };

    const openLinkDeptDialog = (div: Division) => {
        setShowLinkDeptDialog(div);
        setSelectedDeptIds(div.departments?.map((d) => (typeof d === 'string' ? d : d._id)) || []);
        setLinkDeptSearch('');
        setLinkConfirmData(null);
    };

    const closeDivisionForm = () => {
        setShowCreateDialog(false);
        setShowEditDialog(null);
        resetForm();
    };

    const closeLinkDeptDialog = () => {
        setShowLinkDeptDialog(null);
        setLinkDeptSearch('');
        setLinkConfirmData(null);
    };

    const closeShiftDialog = () => {
        setShowShiftDialog(null);
        setShiftSearch('');
    };

    const filterDepartmentsForLink = () =>
        departments.filter((dept) => {
            const search = linkDeptSearch.toLowerCase();
            if (!search) return true;
            return (dept.name || '').toLowerCase().includes(search) || (dept.code || '').toLowerCase().includes(search);
        });

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
        setSelectedShifts([]);
        setError('');
        setSegmentShiftId('');
    };

    const openShiftDialog = (div: Division) => {
        setShowShiftDialog(div);
        resetShiftForm();
        // Shift loading is handled by useEffect when dialog opens
    };

    const renderDivisionFormFields = () => (
        <div className="space-y-4">
            <LoanFormPanel>
                <LoanFormLabel>Name *</LoanFormLabel>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                />
            </LoanFormPanel>
            <LoanFormPanel>
                <LoanFormLabel>Code *</LoanFormLabel>
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    required
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                />
            </LoanFormPanel>
            <LoanFormPanel>
                <LoanFormLabel>Description</LoanFormLabel>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                />
            </LoanFormPanel>
            <LoanFormPanel>
                <LoanFormLabel>Division manager (optional)</LoanFormLabel>
                <select
                    value={managerId}
                    onChange={(e) => setManagerId(e.target.value)}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                >
                    <option value="">Select manager (optional)</option>
                    {managers.map((user) => (
                        <option key={user._id} value={user._id}>
                            {user.name} ({user.email})
                        </option>
                    ))}
                </select>
            </LoanFormPanel>
            {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>
    );

    const getManagerLabel = (div: Division) =>
        div.manager
            ? typeof div.manager === 'string'
                ? div.manager
                : (div.manager as { name?: string }).name || 'Vacant'
            : 'Vacant';

    if (loading && divisions.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Spinner />
            </div>
        );
    }

    return (
        <LoansPageShell>
            <LoansPageHeader
                badge="Organization"
                title="Divisions"
                subtitle="Manage organizational units, department links, and shift assignments"
                action={
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => downloadDivisionsHierarchyPdf(divisions, departments)}
                            className={ledgerOutlineBtn}
                            style={ledgerBorder}
                        >
                            <Download className="h-3 w-3" />
                            <span className="hidden sm:inline">PDF</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => downloadDivisionsHierarchyExcel(divisions, departments)}
                            className={ledgerOutlineBtn}
                            style={ledgerBorder}
                        >
                            <Download className="h-3 w-3" />
                            <span className="hidden sm:inline">Excel</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                resetForm();
                                setShowCreateDialog(true);
                            }}
                            className={`inline-flex items-center gap-1 ${loansPrimaryButtonClass()}`}
                            style={loansPrimaryButtonStyle()}
                        >
                            <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            <span className="sm:hidden">New</span>
                            <span className="hidden sm:inline">New division</span>
                        </button>
                    </div>
                }
            />

            <LoansStatGrid
                columns={4}
                stats={[
                    { label: 'Total divisions', value: divisionStats.total, accent: true },
                    { label: 'Linked departments', value: divisionStats.linkedDepts, highlight: true },
                    { label: 'Avg depts / division', value: divisionStats.avgDepts },
                    { label: 'With manager', value: divisionStats.withManager, muted: true },
                ]}
            />

            <LoanDetailDialog open={showCreateDialog} onClose={closeDivisionForm} maxWidth="max-w-md" layerClass="z-[100]">
                <form onSubmit={handleCreateDivision} className="flex min-h-0 flex-1 flex-col">
                    <LoanDetailDialogHeader
                        badge="Division"
                        title="New division"
                        subtitle="Configure name, code, and manager"
                        onClose={closeDivisionForm}
                    />
                    <LoanDetailDialogBody>{renderDivisionFormFields()}</LoanDetailDialogBody>
                    <LoanDialogFooter onCancel={closeDivisionForm} submitLabel="Create division" />
                </form>
            </LoanDetailDialog>

            <LoanDetailDialog open={!!showEditDialog} onClose={closeDivisionForm} maxWidth="max-w-md" layerClass="z-[100]">
                <form onSubmit={handleUpdateDivision} className="flex min-h-0 flex-1 flex-col">
                    <LoanDetailDialogHeader
                        badge="Division"
                        title="Edit division"
                        subtitle="Update organizational parameters"
                        onClose={closeDivisionForm}
                    />
                    <LoanDetailDialogBody>{renderDivisionFormFields()}</LoanDetailDialogBody>
                    <LoanDialogFooter onCancel={closeDivisionForm} submitLabel="Save changes" />
                </form>
            </LoanDetailDialog>

            <LoansContentPanel>
                <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
                    <LoansSectionTitle>Organizational units</LoansSectionTitle>
                    <div className="flex items-center gap-3">
                        <span className={`hidden text-[10px] font-semibold uppercase tracking-widest sm:inline ${ledgerStatusBadgeClass('neutral')}`}>
                            {divisions.length} divisions
                        </span>
                        <div className="flex border p-0.5" style={ledgerBorder}>
                            <button
                                type="button"
                                onClick={() => setViewMode('cards')}
                                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider sm:px-3 sm:py-1.5 sm:text-xs ${
                                    viewMode === 'cards'
                                        ? 'bg-[var(--ps-accent-soft)] text-[var(--ps-accent)]'
                                        : 'text-stone-500 hover:text-stone-700'
                                }`}
                            >
                                Cards
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider sm:px-3 sm:py-1.5 sm:text-xs ${
                                    viewMode === 'table'
                                        ? 'bg-[var(--ps-accent-soft)] text-[var(--ps-accent)]'
                                        : 'text-stone-500 hover:text-stone-700'
                                }`}
                            >
                                Table
                            </button>
                        </div>
                    </div>
                </div>

                {divisions.length === 0 ? (
                    <div className="py-16 text-center sm:py-20">
                        <div
                            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-md border sm:h-20 sm:w-20"
                            style={ledgerBorder}
                        >
                            <Building2 className="h-8 w-8 text-stone-300 sm:h-10 sm:w-10" />
                        </div>
                        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">No divisions yet</h3>
                        <p className="mt-2 text-sm text-stone-500">Start by creating your first organizational unit.</p>
                    </div>
                ) : viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                        {divisions.map((div) => (
                            <DivisionCard
                                key={div._id}
                                div={div}
                                workflowsBasePath={workflowsBasePath}
                                showWorkflowsLink={showWorkflowsLink}
                                onEdit={() => openEditDialog(div)}
                                onDelete={() => void handleDeleteDivision(div._id)}
                                onLinkDepts={() => openLinkDeptDialog(div)}
                                onShifts={() => openShiftDialog(div)}
                            />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {divisions.map((div) => (
                                <DivisionCard
                                    key={div._id}
                                    div={div}
                                    workflowsBasePath={workflowsBasePath}
                                    showWorkflowsLink={showWorkflowsLink}
                                    onEdit={() => openEditDialog(div)}
                                    onDelete={() => void handleDeleteDivision(div._id)}
                                    onLinkDepts={() => openLinkDeptDialog(div)}
                                    onShifts={() => openShiftDialog(div)}
                                />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[720px] text-left text-sm text-stone-600">
                                <thead>
                                    <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                                        <th className="px-3 py-2.5 font-semibold">Division</th>
                                        <th className="px-3 py-2.5 font-semibold">Code</th>
                                        <th className="px-3 py-2.5 font-semibold">Manager</th>
                                        <th className="px-3 py-2.5 text-center font-semibold">Departments</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={ledgerBorder}>
                                    {divisions.map((div) => (
                                        <tr key={div._id} className="transition-colors hover:bg-stone-50/80 dark:hover:bg-stone-900/40">
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-bold"
                                                        style={{
                                                            borderColor: 'var(--ps-accent-border)',
                                                            backgroundColor: 'var(--ps-accent-soft)',
                                                            color: 'var(--ps-accent)',
                                                        }}
                                                    >
                                                        {(div.code || div.name).substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="truncate font-semibold text-stone-900 dark:text-stone-100">{div.name}</div>
                                                        {div.description ? (
                                                            <div className="max-w-[200px] truncate text-xs text-stone-400">{div.description}</div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <span className={ledgerStatusBadgeClass('neutral')}>{div.code}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <UserIcon className="h-3.5 w-3.5 text-stone-400" />
                                                    <span className="font-medium text-stone-700 dark:text-stone-200">{getManagerLabel(div)}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="inline-flex items-center gap-2">
                                                    <span className="min-w-[2rem] rounded-md bg-indigo-50 px-2 py-0.5 text-center font-bold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                                                        {div.departments?.length || 0}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openLinkDeptDialog(div)}
                                                        className="text-xs font-semibold text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
                                                    >
                                                        Manage
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {showWorkflowsLink ? (
                                                        <Link
                                                            href={`${workflowsBasePath}/${div._id}/workflows`}
                                                            className={`${ledgerOutlineBtn} !px-2 !py-1`}
                                                            style={ledgerBorder}
                                                        >
                                                            <GitBranch className="h-3 w-3" />
                                                            WF
                                                        </Link>
                                                    ) : null}
                                                    <DivRowActions
                                                        onShifts={() => openShiftDialog(div)}
                                                        onEdit={() => openEditDialog(div)}
                                                        onDelete={() => void handleDeleteDivision(div._id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </LoansContentPanel>

            <LoanDetailDialog
                open={!!showLinkDeptDialog}
                onClose={() => {
                    if (!linkConfirmData) closeLinkDeptDialog();
                }}
                maxWidth="max-w-lg"
                layerClass="z-[110]"
            >
                {showLinkDeptDialog && linkConfirmData ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <LoanDetailDialogHeader
                            badge="Confirmation"
                            title="Departments need confirmation"
                            subtitle={`Some departments still have employees assigned to ${showLinkDeptDialog.name}`}
                            onClose={() => setLinkConfirmData(null)}
                        />
                        <LoanDetailDialogBody>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50">
                                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm text-stone-500">Your other changes were already saved. Review the departments below before forcing an unlink.</p>
                                        </div>
                                    </div>
                                    {(linkConfirmData.safeUnlinkedCount > 0 || linkConfirmData.addedCount > 0) && (
                                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex flex-wrap gap-3">
                                            {linkConfirmData.addedCount > 0 && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                    {linkConfirmData.addedCount} department{linkConfirmData.addedCount !== 1 ? 's' : ''} linked
                                                </span>
                                            )}
                                            {linkConfirmData.safeUnlinkedCount > 0 && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                    {linkConfirmData.safeUnlinkedCount} department{linkConfirmData.safeUnlinkedCount !== 1 ? 's' : ''} unlinked (no employees)
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Still needs confirmation</p>
                                    <div className="rounded-2xl border border-amber-100 bg-amber-50 divide-y divide-amber-100">
                                        {linkConfirmData.affectedDepartments.map((d) => (
                                            <div key={d.departmentId} className="flex items-center justify-between px-4 py-3">
                                                <span className="text-sm font-semibold text-slate-800">{d.departmentName}</span>
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                    {d.employeeCount} employee{d.employeeCount !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-2 pt-2">
                                        <button type="button" onClick={handleForceUnlink} className={`w-full ${loansDialogPrimaryButtonClass()}`} style={loansDialogPrimaryButtonStyle()}>Yes, unlink anyway</button>
                                        <button type="button" onClick={() => { setLinkConfirmData(null); closeLinkDeptDialog(); loadData(); }} className={`w-full ${loansDialogSecondaryButtonClass()}`} style={loansDialogSecondaryButtonStyle()}>Keep safe changes only</button>
                                        <button type="button" onClick={() => setLinkConfirmData(null)} className={`w-full ${loansDialogOutlineButtonClass()}`} style={loansDialogOutlineButtonStyle()}>Go back to selection</button>
                                    </div>
                                </div>
                        </LoanDetailDialogBody>
                    </div>
                ) : showLinkDeptDialog ? (
                    <form onSubmit={handleLinkDepartments} className="flex min-h-0 flex-1 flex-col">
                        <LoanDetailDialogHeader
                            badge="Departments"
                            title="Link departments"
                            subtitle={showLinkDeptDialog.name}
                            onClose={closeLinkDeptDialog}
                        />
                        <LoanDetailDialogBody>
                            <div className="space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                                    <input
                                        type="text"
                                        placeholder="Search departments by name or code..."
                                        value={linkDeptSearch}
                                        onChange={(e) => setLinkDeptSearch(e.target.value)}
                                        className={`${loansFormInputClass()} pl-9`}
                                        style={loansFormInputStyle()}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const filtered = filterDepartmentsForLink();
                                            setSelectedDeptIds((prev) => [...new Set([...prev, ...filtered.map((d) => d._id)])]);
                                        }}
                                        className={loansDialogOutlineButtonClass()}
                                        style={loansDialogOutlineButtonStyle()}
                                    >
                                        Select all
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const filteredIds = new Set(filterDepartmentsForLink().map((d) => d._id));
                                            setSelectedDeptIds((prev) => prev.filter((id) => !filteredIds.has(id)));
                                        }}
                                        className={loansDialogOutlineButtonClass()}
                                        style={loansDialogOutlineButtonStyle()}
                                    >
                                        Deselect all
                                    </button>
                                </div>
                                <div className="max-h-80 overflow-y-auto border p-2" style={ledgerBorder}>
                                    {filterDepartmentsForLink().map((dept) => (
                                        <label
                                            key={dept._id}
                                            className="flex cursor-pointer items-center gap-3 p-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedDeptIds.includes(dept._id)}
                                                onChange={() =>
                                                    setSelectedDeptIds((prev) =>
                                                        prev.includes(dept._id) ? prev.filter((id) => id !== dept._id) : [...prev, dept._id]
                                                    )
                                                }
                                                className="h-4 w-4 rounded border-stone-300 text-[var(--ps-accent)] focus:ring-[var(--ps-accent)]"
                                            />
                                            <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                                                {dept.name} <span className="text-xs text-stone-400">({dept.code})</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                {error ? <p className="text-xs text-rose-600">{error}</p> : null}
                            </div>
                        </LoanDetailDialogBody>
                        <LoanDialogFooter onCancel={closeLinkDeptDialog} submitLabel="Save selection" />
                    </form>
                ) : null}
            </LoanDetailDialog>

            <LoanDetailDialog open={!!showShiftDialog} onClose={closeShiftDialog} maxWidth="max-w-2xl" layerClass="z-[100]">
                {showShiftDialog ? (
                    <form onSubmit={handleAssignShifts} className="flex min-h-0 flex-1 flex-col">
                        <LoanDetailDialogHeader
                            badge="Shifts"
                            title="Assign shifts"
                            subtitle={showShiftDialog.name}
                            onClose={closeShiftDialog}
                        />
                        <LoanDetailDialogBody>
                            <div className="space-y-4">
                                {/* Scope Selector */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Target Scope</label>
                                    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                                        {(['division', 'department', 'designation'] as const).map((scope) => (
                                            <button
                                                key={scope}
                                                type="button"
                                                onClick={() => { setTargetScope(scope); setSelectedShifts([]); }}
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

                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold uppercase text-slate-500">Select Shifts</label>
                                    <div className="relative">
                                        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search shifts by name or time..."
                                            value={shiftSearch}
                                            onChange={(e) => setShiftSearch(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-4 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        />
                                    </div>
                                </div>
                                <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-100 p-2 dark:border-slate-800">
                                    {shifts.filter(shift => {
                                        const search = shiftSearch.toLowerCase();
                                        if (!search) return true;
                                        const name = (shift.name || '').toLowerCase();
                                        const startTime = (shift.startTime || '').toLowerCase();
                                        const endTime = (shift.endTime || '').toLowerCase();
                                        return name.includes(search) || startTime.includes(search) || endTime.includes(search);
                                    }).map(shift => {
                                        const isSelected = selectedShifts.some(s => s.shiftId === shift._id);
                                        const selectedConfig = selectedShifts.find(s => s.shiftId === shift._id);

                                        return (
                                            <div key={shift._id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        if (isSelected) {
                                                            setSelectedShifts(prev => prev.filter(s => s.shiftId !== shift._id));
                                                        } else {
                                                            setSelectedShifts(prev => [...prev, { shiftId: shift._id, gender: 'All', employee_group_ids: [] }]);
                                                        }
                                                    }}
                                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                                                />
                                                <div className="flex-1 cursor-pointer" onClick={() => {
                                                    if (!isSelected) {
                                                        setSelectedShifts(prev => [...prev, { shiftId: shift._id, gender: 'All', employee_group_ids: [] }]);
                                                    }
                                                }}>
                                                    <div className="text-sm text-slate-700 dark:text-slate-300 font-semibold">{shift.name}</div>
                                                    <div className="text-[10px] text-slate-500">{shift.startTime} - {shift.endTime} ({shift.duration} mins)</div>
                                                </div>

                                                {/* Gender Selector - Only visible if checked */}
                                                {isSelected && (
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={selectedConfig?.gender || 'All'}
                                                            onChange={(e) => {
                                                                const newGender = e.target.value;
                                                                setSelectedShifts(prev => prev.map(s =>
                                                                    s.shiftId === shift._id ? { ...s, gender: newGender } : s
                                                                ));
                                                            }}
                                                            className="text-xs rounded-lg border-slate-200 bg-white px-2 py-1 focus:border-amber-500 focus:outline-none dark:bg-slate-900 dark:border-slate-700"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="All">All Genders</option>
                                                            <option value="Male">Male Only</option>
                                                            <option value="Female">Female Only</option>
                                                            <option value="Other">Other</option>
                                                        </select>
                                                        {customGroupingEnabled && selectedConfig && (
                                                            <div
                                                                className="flex min-w-[140px] max-w-[220px] flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <label className="flex cursor-pointer items-center gap-2 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                                                        checked={selectedConfig.employee_group_ids.length === 0}
                                                                        onChange={() => {
                                                                            setSelectedShifts((prev) =>
                                                                                prev.map((s) =>
                                                                                    s.shiftId === shift._id ? { ...s, employee_group_ids: [] } : s
                                                                                )
                                                                            );
                                                                        }}
                                                                    />
                                                                    All groups
                                                                </label>
                                                                <div className="max-h-28 space-y-1 overflow-y-auto border-t border-slate-100 pt-1.5 dark:border-slate-700">
                                                                    {employeeGroups.map((group) => {
                                                                        const allGroups = selectedConfig.employee_group_ids.length === 0;
                                                                        const checked =
                                                                            !allGroups && selectedConfig.employee_group_ids.includes(group._id);
                                                                        return (
                                                                            <label
                                                                                key={group._id}
                                                                                className="flex cursor-pointer items-center gap-2 text-[10px] text-slate-700 dark:text-slate-300"
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                                                                    checked={checked}
                                                                                    onChange={(e) => {
                                                                                        const want = e.target.checked;
                                                                                        setSelectedShifts((prev) =>
                                                                                            prev.map((s) => {
                                                                                                if (s.shiftId !== shift._id) return s;
                                                                                                if (want) {
                                                                                                    if (allGroups) {
                                                                                                        return { ...s, employee_group_ids: [group._id] };
                                                                                                    }
                                                                                                    if (!s.employee_group_ids.includes(group._id)) {
                                                                                                        return {
                                                                                                            ...s,
                                                                                                            employee_group_ids: [
                                                                                                                ...s.employee_group_ids,
                                                                                                                group._id,
                                                                                                            ],
                                                                                                        };
                                                                                                    }
                                                                                                    return s;
                                                                                                }
                                                                                                const next = s.employee_group_ids.filter(
                                                                                                    (id) => id !== group._id
                                                                                                );
                                                                                                return { ...s, employee_group_ids: next };
                                                                                            })
                                                                                        );
                                                                                    }}
                                                                                />
                                                                                <span className="truncate">{group.name}</span>
                                                                            </label>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Segment editor (division-specific halves/break) */}
                                {selectedShifts.length > 0 && (
                                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Half-day segments (Division-specific)</div>
                                                <div className="text-[11px] text-slate-500">
                                                    These times are saved on this Division’s shift assignment (not on the Shift master).
                                                </div>
                                            </div>
                                            <select
                                                value={segmentShiftId || selectedShifts[0].shiftId}
                                                onChange={(e) => setSegmentShiftId(e.target.value)}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                            >
                                                {selectedShifts.map((s) => {
                                                    const def = shifts.find((x) => x._id === s.shiftId);
                                                    return (
                                                        <option key={s.shiftId} value={s.shiftId}>
                                                            {def?.name || s.shiftId}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>

                                        {(() => {
                                            const activeId = segmentShiftId || selectedShifts[0].shiftId;
                                            const row = selectedShifts.find((s) => s.shiftId === activeId);
                                            if (!row) return null;

                                            const setRow = (patch: Partial<typeof row>) => {
                                                setSelectedShifts((prev) =>
                                                    prev.map((s) => (s.shiftId === activeId ? { ...s, ...patch } : s))
                                                );
                                            };

                                            const segOn = !!(row.firstHalf || row.break || row.secondHalf);

                                            return (
                                                <div className="space-y-4">
                                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                                            checked={segOn}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setRow({
                                                                        firstHalf: { startTime: '', endTime: '', duration: null, minDuration: null, gracePeriod: null, payableShifts: null },
                                                                        break: { startTime: '', endTime: '' },
                                                                        secondHalf: { startTime: '', endTime: '', duration: null, minDuration: null, gracePeriod: null, payableShifts: null },
                                                                    });
                                                                } else {
                                                                    setRow({ firstHalf: null, break: null, secondHalf: null });
                                                                }
                                                            }}
                                                        />
                                                        Enable division-specific segments for this shift
                                                    </label>

                                                    {segOn && (
                                                        <div className="grid grid-cols-1 gap-4">
                                                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                                                                <div className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">First half</div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <input
                                                                        type="time"
                                                                        value={row.firstHalf?.startTime || ''}
                                                                        onChange={(e) => setRow({ firstHalf: { ...(row.firstHalf || {}), startTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                    <input
                                                                        type="time"
                                                                        value={row.firstHalf?.endTime || ''}
                                                                        onChange={(e) => setRow({ firstHalf: { ...(row.firstHalf || {}), endTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                </div>
                                                                <div className="mt-3 grid grid-cols-2 gap-3">
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={row.firstHalf?.gracePeriod ?? ''}
                                                                        onChange={(e) => setRow({ firstHalf: { ...(row.firstHalf || {}), gracePeriod: e.target.value === '' ? null : Number(e.target.value) } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                        placeholder="Grace (mins)"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={row.firstHalf?.payableShifts ?? ''}
                                                                        onChange={(e) => setRow({ firstHalf: { ...(row.firstHalf || {}), payableShifts: e.target.value === '' ? null : Number(e.target.value) } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                        placeholder="Payable (e.g. 0.5)"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                                                                <div className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">Break</div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <input
                                                                        type="time"
                                                                        value={row.break?.startTime || ''}
                                                                        onChange={(e) => setRow({ break: { ...(row.break || {}), startTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                    <input
                                                                        type="time"
                                                                        value={row.break?.endTime || ''}
                                                                        onChange={(e) => setRow({ break: { ...(row.break || {}), endTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                                                                <div className="mb-2 text-xs font-bold text-slate-800 dark:text-slate-100">Second half</div>
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <input
                                                                        type="time"
                                                                        value={row.secondHalf?.startTime || ''}
                                                                        onChange={(e) => setRow({ secondHalf: { ...(row.secondHalf || {}), startTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                    <input
                                                                        type="time"
                                                                        value={row.secondHalf?.endTime || ''}
                                                                        onChange={(e) => setRow({ secondHalf: { ...(row.secondHalf || {}), endTime: e.target.value } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                    />
                                                                </div>
                                                                <div className="mt-3 grid grid-cols-2 gap-3">
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={row.secondHalf?.gracePeriod ?? ''}
                                                                        onChange={(e) => setRow({ secondHalf: { ...(row.secondHalf || {}), gracePeriod: e.target.value === '' ? null : Number(e.target.value) } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                        placeholder="Grace (mins)"
                                                                    />
                                                                    <input
                                                                        type="number"
                                                                        inputMode="decimal"
                                                                        value={row.secondHalf?.payableShifts ?? ''}
                                                                        onChange={(e) => setRow({ secondHalf: { ...(row.secondHalf || {}), payableShifts: e.target.value === '' ? null : Number(e.target.value) } })}
                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                                                                        placeholder="Payable (e.g. 0.5)"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {error ? <p className="text-xs text-rose-600">{error}</p> : null}
                            </div>
                        </LoanDetailDialogBody>
                        <LoanDialogFooter onCancel={closeShiftDialog} submitLabel="Save assignments" />
                    </form>
                ) : null}
            </LoanDetailDialog>
        </LoansPageShell>
    );
}
