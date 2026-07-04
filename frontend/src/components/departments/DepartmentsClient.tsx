'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { api, Department, Designation, Division, Shift, User } from '@/lib/api';
import {
  Plus,
  AlertCircle,
  Pencil,
  Trash2,
  Building2,
  Clock,
  User as UserIcon,
  Users,
  Briefcase,
  Link2,
  Search,
  Upload,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import BulkUpload from '@/components/BulkUpload';
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
  LoanDetailSectionTitle,
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
import { ledgerActionButtonClass, ledgerStatusBadgeClass, ledgerTableActionsCellClass, ledgerTableActionsGroupClass, ledgerTableActionsHeaderClass } from '@/lib/ledgerUi';
import { alertConfirm, ledgerSwalFire } from '@/lib/customSwal';
import {
  confirmDeleteWithAssignedEmployees,
  showDeleteError,
  showDeleteSuccess,
} from '@/lib/assignedEmployeesDeleteSwal';
import {
  DEPARTMENT_TEMPLATE_HEADERS,
  DEPARTMENT_TEMPLATE_SAMPLE,
  DESIGNATION_TEMPLATE_HEADERS,
  DESIGNATION_TEMPLATE_SAMPLE,
  validateDepartmentRow,
  validateDesignationRow,
} from '@/lib/bulkUpload';
import Spinner from '@/components/Spinner';

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

const ledgerOutlineBtn =
  'inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 transition hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-900 sm:px-3 sm:py-2 sm:text-xs';

function DeptRowActions({
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
    <div className={`${ledgerTableActionsGroupClass('right')} ${className}`}>
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

function DepartmentCard({
  dept,
  isLinked,
  onCardClick,
  onEdit,
  onDelete,
  onRoles,
  onShifts,
}: {
  dept: Department;
  isLinked: boolean;
  onCardClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRoles: () => void;
  onShifts: () => void;
}) {
  const initials = (dept.code || dept.name.substring(0, 2)).substring(0, 2).toUpperCase();
  const hodLabel =
    dept.divisionHODs && dept.divisionHODs.length > 0
      ? `${dept.divisionHODs.length} Div HODs`
      : dept.hod?.name || 'Vacant';

  return (
    <div
      onClick={() => void onCardClick()}
      className={`group relative flex min-h-[220px] flex-col border bg-white p-4 transition-all duration-300 dark:bg-stone-950 sm:p-5 ${
        isLinked
          ? 'hover:-translate-y-0.5 hover:shadow-md hover:shadow-[var(--ps-accent-soft)]'
          : 'cursor-pointer opacity-60 grayscale-[0.85] hover:opacity-90'
      }`}
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
            <h3
              className="truncate text-base font-semibold text-stone-900 transition-colors group-hover:text-[var(--ps-accent)] dark:text-stone-100"
            >
              {dept.name}
            </h3>
            {dept.code ? (
              <span className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-stone-500 bg-stone-100 dark:bg-stone-900">
                {dept.code}
              </span>
            ) : null}
          </div>
        </div>
        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <DeptRowActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      {dept.description ? (
        <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          {dept.description}
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
            <p className="text-[9px] font-semibold uppercase tracking-widest text-stone-400">Head of dept</p>
            <p className="truncate text-xs font-semibold text-stone-700 dark:text-stone-200">{hodLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRoles();
            }}
            className="flex flex-col items-center justify-center border border-indigo-200 bg-indigo-50/60 p-2.5 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/30"
          >
            <span className="text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
              {dept.designations?.length || 0}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-indigo-500">
              <Briefcase className="h-3 w-3" />
              Roles
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShifts();
            }}
            className="flex flex-col items-center justify-center border border-amber-200 bg-amber-50/60 p-2.5 transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
          >
            <span className="text-sm font-bold tracking-tight text-amber-600 dark:text-amber-400">Assign</span>
            <span className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-amber-500">
              <Clock className="h-3 w-3" />
              Shifts
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DepartmentsClient() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [unlinkedDesignations, setUnlinkedDesignations] = useState<Designation[]>([]); // New state for linking
  const [loading, setLoading] = useState(true);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<Department | null>(null);
  const [showDesignationDialog, setShowDesignationDialog] = useState<string | null>(null);
  const [showLinkDesignationDialog, setShowLinkDesignationDialog] = useState<string | null>(null); // New dialog state
  const [selectedLinkDesignationId, setSelectedLinkDesignationId] = useState(''); // Added state for link selection
  const [linkDesignationSearch, setLinkDesignationSearch] = useState(''); // Search filter for link designation
  const [existingDesignationSearch, setExistingDesignationSearch] = useState(''); // Search filter for existing designations list
  const [loadingDesignations, setLoadingDesignations] = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState<Department | null>(null);
  const [showDesignationShiftDialog, setShowDesignationShiftDialog] = useState<Designation | null>(null);
  const [showShiftBreakdownDialog, setShowShiftBreakdownDialog] = useState<Designation | null>(null);
  const [showBulkUploadDept, setShowBulkUploadDept] = useState(false);
  const [showBulkUploadDesig, setShowBulkUploadDesig] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [error, setError] = useState('');

  // Department form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  // const [hodId, setHodId] = useState(''); // Removed Global HOD

  // Shift assignment state
  const [selectedShifts, setSelectedShifts] = useState<{ shiftId: string; gender: string }[]>([]);
  const [selectedDesignationShifts, setSelectedDesignationShifts] = useState<{ shiftId: string; gender: string }[]>([]);
  const [targetScope, setTargetScope] = useState<'division' | 'department' | 'designation'>('department');
  const [targetDivisionId, setTargetDivisionId] = useState<string>('');
  const [targetDesignationId, setTargetDesignationId] = useState<string>('');

  // Effect to pre-fill shifts when scope/target changes
  useEffect(() => {
    if (!showShiftDialog) return;

    let newSelectedShifts: { shiftId: string; gender: string }[] = [];

    const normalizeShifts = (shifts: any[]) => {
      return (shifts || []).map((s: any) => {
        if (typeof s === 'string') return { shiftId: s, gender: 'All' };
        if (s.shiftId) {
          const sId = typeof s.shiftId === 'string' ? s.shiftId : s.shiftId._id;
          return { shiftId: sId, gender: s.gender || 'All' };
        }
        return { shiftId: s._id, gender: 'All' };
      });
    };

    if (targetScope === 'department') {
      if (targetDivisionId) {
        // Look for division-specific overrides
        // divisionDefaults is now populated
        const defaults = showShiftDialog.divisionDefaults?.find((dd: any) =>
          (typeof dd.division === 'string' ? dd.division : dd.division._id) === targetDivisionId
        );
        newSelectedShifts = normalizeShifts(defaults?.shifts || []);
      } else {
        // Use global department shifts
        newSelectedShifts = normalizeShifts(showShiftDialog.shifts || []);
      }
    } else if (targetScope === 'designation') {
      if (targetDesignationId) {
        const desig = designations.find(d => d._id === targetDesignationId);
        if (desig) {
          if (targetDivisionId) {
            // Designation in Dept in Division
            // We need to look in desig.departmentShifts for matching dept AND division
            // OR desig.divisionDefaults?
            // Based on backend 'designation_in_dept_in_div' it updates departmentShifts with division field
            const override = desig.departmentShifts?.find((ds: any) =>
              (typeof ds.department === 'string' ? ds.department : ds.department._id) === showShiftDialog._id &&
              (typeof ds.division === 'string' ? ds.division : ds.division._id) === targetDivisionId
            );
            newSelectedShifts = normalizeShifts(override?.shifts || []);
          } else {
            // Designation in Dept (Global context of Dept?) or just Designation Global?
            // Since 'Context Division' is required for Designation scope if divisions exist...
            // If divisions exist but none selected (not possible due to required?), fallback to dept specific without division?
            const override = desig.departmentShifts?.find((ds: any) =>
              (typeof ds.department === 'string' ? ds.department : ds.department._id) === showShiftDialog._id &&
              !ds.division
            );
            // If no specific override, maybe fall back to global designation shifts?
            // Usually if I am editing a specific scope, I start with what is THERE.
            // If nothing is there, I start empty? Or inherited? 
            // Inheritance is better UX but tricky to save 'no change'.
            // For now, let's show what is explicitly saved.
            if (override) {
              newSelectedShifts = normalizeShifts(override.shifts);
            } else {
              // Should we show designation global? 
              // Maybe not, to avoid confusion that it's an override.
              newSelectedShifts = [];
            }
          }
        }
      }
    }

    setSelectedShifts(newSelectedShifts);

  }, [targetScope, targetDivisionId, targetDesignationId, showShiftDialog, designations]);

  // Division HOD state
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionHODMap, setDivisionHODMap] = useState<Record<string, string>>({}); // {divisionId: hodId }
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>('all');
  const [divisionSearch, setDivisionSearch] = useState('');

  // Designation form state
  const [designationName, setDesignationName] = useState('');
  const [designationCode, setDesignationCode] = useState('');
  const [designationDescription, setDesignationDescription] = useState('');
  const [designationPaidLeaves, setDesignationPaidLeaves] = useState(0);

  useEffect(() => {
    loadDepartments();
    loadUsers();
    loadDivisions();
    // Load shifts on page load so they're available when dialog opens
    loadShifts();
  }, []);

  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions(true);
      if (response.success && response.data) {
        setDivisions(response.data);
      }
    } catch (err) {
      console.error('Error loading divisions:', err);
    }
  };

  const loadDepartments = async () => {
    try {
      setLoading(true);
      // Pass true to get populated data (including designations)
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await api.getUsers();
      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const loadShifts = async () => {
    try {
      setLoadingShifts(true);
      // Load all shifts (not just active) so users can see all available options
      const response = await api.getShifts();
      console.log('Shifts API Response:', response);
      if (response.success && response.data) {
        setShifts(response.data);
        console.log('Loaded shifts:', response.data);
      } else {
        console.error('Failed to load shifts:', response.message || 'Unknown error');
        setError(response.message || 'Failed to load shifts');
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
      setError('Error loading shifts. Please try again.');
    } finally {
      setLoadingShifts(false);
    }
  };

  const loadDesignations = async (departmentId: string) => {
    setLoadingDesignations(true);
    try {
      // If global (departmentId === 'global'), fetch all designations
      if (departmentId === 'global') {
        const response = await api.getAllDesignations();
        if (response.success && response.data) {
          setDesignations(response.data);
        }
      } else {
        // For department-specific, always call API to get resolved shifts
        const response = await api.getDesignations(departmentId);
        if (response.success && response.data) {
          setDesignations(response.data);
        }
      }
    } catch (err) {
      console.error('Error loading designations:', err);
    } finally {
      setLoadingDesignations(false);
    }
  };

  const loadUnlinkedDesignations = async (departmentId: string) => {
    try {
      const response = await api.getAllDesignations();
      if (response.success && response.data) {
        const allDesigs = response.data;
        const currentDept = departments.find(d => d._id === departmentId);
        const currentDesigIds = currentDept?.designations?.map((d: any) => typeof d === 'string' ? d : d._id) || [];

        // Filter out designations already linked to this department
        const unlinked = allDesigs.filter((d: Designation) => !currentDesigIds.includes(d._id));
        setUnlinkedDesignations(unlinked);
      }
    } catch (err) {
      console.error('Error loading unlinked designations:', err);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const data = {
        name,
        code: code || undefined,
        description: description || undefined,
        divisionHODs: Object.entries(divisionHODMap)
          .filter(([_, hId]) => hId) // Only send if HOD is selected
          .map(([divId, hId]) => ({ division: divId, hod: hId })),
      };

      const response = await api.createDepartment(data);

      if (response.success) {
        setShowCreateDialog(false);
        resetDepartmentForm();
        loadDepartments();
      } else {
        setError(response.message || 'Failed to create department');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleUpdateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditDialog) return;
    setError('');

    try {
      const data = {
        name,
        code: code || undefined,
        description: description || undefined,

        divisionHODs: Object.entries(divisionHODMap)
          .filter(([_, hId]) => hId)
          .map(([divId, hId]) => ({ division: divId, hod: hId })),
      };

      const response = await api.updateDepartment(showEditDialog._id, data);

      if (response.success) {
        setShowEditDialog(null);
        resetDepartmentForm();
        loadDepartments();
      } else {
        setError(response.message || 'Failed to update department');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleAssignShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showShiftDialog) return;
    setError('');

    try {
      let response;

      if (targetDivisionId) {
        // Use hierarchical division-based assignment
        let targetType = '';
        let targetId: string | { designationId: string; departmentId: string } = targetDivisionId;

        if (targetScope === 'division') {
          targetType = 'division_general';
        } else if (targetScope === 'department') {
          targetType = 'department_in_division';
          targetId = showShiftDialog._id;
        } else if (targetScope === 'designation') {
          targetType = 'designation_in_dept_in_div';
          targetId = {
            designationId: targetDesignationId,
            departmentId: showShiftDialog._id
          };
        }

        response = await api.assignShiftsToDivision(targetDivisionId, {
          shifts: selectedShifts,
          targetType,
          targetId
        });
      } else if (targetScope === 'department') {
        // Fallback to legacy global department assignment if no division context
        response = await api.assignShifts(showShiftDialog._id, selectedShifts);
      } else {
        setError('Division context is required for this scope');
        return;
      }

      if (response.success) {
        setShowShiftDialog(null);
        setSelectedShifts([]);
        setTargetScope('department');
        setTargetDivisionId('');
        setTargetDesignationId('');
        loadDepartments();
      } else {
        setError(response.message || 'Failed to assign shifts');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleCreateDesignation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDesignationDialog) return;
    setError('');

    try {
      const data = {
        name: designationName,
        code: designationCode || undefined,
        description: designationDescription || undefined,
        paidLeaves: designationPaidLeaves || 0,
      };

      let response;
      if (showDesignationDialog === 'global') {
        response = await api.createGlobalDesignation(data);
      } else {
        response = await api.createDesignation(showDesignationDialog, data);
      }

      if (response.success) {
        if (showDesignationDialog !== 'global') {
          // Reload departments to update the list
          loadDepartments();
        }
        setShowDesignationDialog(null);
        resetDesignationForm();
        // If we were viewing a department, refresh it
        if (showDesignationDialog !== 'global') {
          loadDesignations(showDesignationDialog);
        }
      } else {
        setError(response.message || 'Failed to create designation');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleLinkDesignation = async (designationId: string) => {
    if (!showLinkDesignationDialog) return;
    try {
      const response = await api.linkDesignationToDepartment(showLinkDesignationDialog, designationId);
      if (response.success) {
        loadDepartments(); // Reload to get updated structure
        setShowLinkDesignationDialog(null);
        setLinkDesignationSearch('');
      } else {
        alert(response.message || 'Failed to link designation');
      }
    } catch (err) {
      console.error('Error linking designation:', err);
    }
  };

  const handleDeleteDesignation = async (designation: Designation) => {
    try {
      const employeesResponse = await api.getDesignationEmployees(designation._id);
      const employees = Array.isArray(employeesResponse?.data) ? employeesResponse.data : [];

      const confirmed = await confirmDeleteWithAssignedEmployees(designation.name, employees, {
        entityLabel: 'Designation',
        deleteConfirmButton: 'Delete designation',
      });
      if (!confirmed) return;

      const deleteResponse = await api.deleteDesignation(designation._id);
      if (deleteResponse.success) {
        await loadDesignations(showDesignationDialog || 'global');
        if (showDesignationDialog !== 'global') {
          await loadDepartments();
        }
        await showDeleteSuccess('Designation');
      } else {
        await showDeleteError(deleteResponse.message || 'Failed to delete designation');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred while deleting designation';
      console.error('Error deleting designation:', err);
      await showDeleteError(message);
    }
  };

  const handleCardClick = async (dept: Department) => {
    // If no division is selected, do nothing special
    if (!selectedDivisionId || selectedDivisionId === 'all') return;

    // Check if the department is already linked to the selected division
    const isLinked = dept.divisions?.some(divId =>
      (typeof divId === 'string' ? divId : (divId as Division)._id) === selectedDivisionId
    );

    if (isLinked) return;

    // If not linked, show the interactive "One-Click Link" confirmation
    const selectedDiv = divisions.find(d => d._id === selectedDivisionId);
    const divName = selectedDiv?.name || 'this division';

    const result = await alertConfirm(
      'Link department?',
      `Link "${dept.name}" to "${divName}"?`,
      'Yes, link',
    );

    if (result.isConfirmed) {
      try {
        const response = await api.linkDepartmentsToDivision(selectedDivisionId, {
          departmentIds: [dept._id],
          action: 'link',
        });

        if (response.success) {
          await ledgerSwalFire({
            size: 'sm',
            icon: 'success',
            title: 'Linked',
            text: `"${dept.name}" linked to "${divName}".`,
            confirmButtonText: 'Done',
            confirmVariant: 'success',
            timer: 2000,
            showConfirmButton: false,
          });
          loadDepartments();
        } else {
          await showDeleteError(response.message || 'Failed to link department');
        }
      } catch (err) {
        console.error('Error linking department to division:', err);
        await showDeleteError('An unexpected error occurred.');
      }
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    const department = departments.find((d) => d._id === id);
    const departmentName = department?.name || 'this department';

    try {
      const employeesResponse = await api.getDepartmentEmployees(id);
      const employees = Array.isArray(employeesResponse?.data) ? employeesResponse.data : [];

      const confirmed = await confirmDeleteWithAssignedEmployees(departmentName, employees, {
        entityLabel: 'Department',
        deleteConfirmButton: 'Delete department',
        fourthColumn: 'designation',
      });
      if (!confirmed) return;

      const response = await api.deleteDepartment(id);
      if (response.success) {
        await loadDepartments();
        await showDeleteSuccess('Department');
      } else {
        await showDeleteError(response.message || 'Failed to delete department');
      }
    } catch (err: unknown) {
      console.error('Error deleting department:', err);
      const message = err instanceof Error ? err.message : 'Error deleting department';
      await showDeleteError(message);
    }
  };

  const resetDepartmentForm = () => {
    setName('');
    setCode('');
    setDescription('');
    // setHodId('');
    setDivisionHODMap({});
    setError('');
  };

  const resetDesignationForm = () => {
    setDesignationName('');
    setDesignationCode('');
    setDesignationDescription('');
    setDesignationPaidLeaves(0);
    setError('');
  };

  const handleOpenDesignationDialog = (departmentId: string) => {
    setShowDesignationDialog(departmentId);
    resetDesignationForm();
    loadDesignations(departmentId);
  };

  const handleOpenEditDialog = (dept: Department) => {
    setShowEditDialog(dept);
    setName(dept.name);
    setCode(dept.code || '');
    setDescription(dept.description || '');


    // Populate Division HOD Map
    const initialMap: Record<string, string> = {};
    if (dept.divisionHODs && Array.isArray(dept.divisionHODs)) {
      dept.divisionHODs.forEach(dh => {
        const divId = typeof dh.division === 'string' ? dh.division : dh.division._id;
        const hId = typeof dh.hod === 'string' ? dh.hod : dh.hod._id;
        if (divId && hId) {
          initialMap[divId] = hId;
        }
      });
    }
    setDivisionHODMap(initialMap);

    setError('');
  };

  const handleOpenShiftDialog = (dept: Department) => {
    setShowShiftDialog(dept);
    // Reload shifts to ensure we have the latest data
    loadShifts();
    // Load designations for this department to populate the dropdown
    loadDesignations(dept._id);
    // Set currently assigned shifts
    // Parse existing shifts which might be strings (old) or objects (new)
    const assignedShifts = (dept.shifts || []).map((s: any) => {
      if (typeof s === 'string') return { shiftId: s, gender: 'All' };
      if (s.shiftId) {
        // It's a config object
        const sId = typeof s.shiftId === 'string' ? s.shiftId : (s.shiftId as Shift)._id;
        return { shiftId: sId, gender: s.gender || 'All' };
      }
      // It's a Shift object directly (legacy case)
      return { shiftId: s._id, gender: 'All' };
    });
    setSelectedShifts(assignedShifts);
    setError('');
  };

  const toggleShiftSelection = (shiftId: string) => {
    setSelectedShifts((prev) => {
      const exists = prev.find(s => s.shiftId === shiftId);
      if (exists) {
        return prev.filter(s => s.shiftId !== shiftId);
      } else {
        return [...prev, { shiftId, gender: 'All' }];
      }
    });
  };

  const updateShiftGender = (shiftId: string, gender: string) => {
    setSelectedShifts(prev => prev.map(s => s.shiftId === shiftId ? { ...s, gender } : s));
  };

  const toggleDesignationShiftSelection = (shiftId: string) => {
    setSelectedDesignationShifts((prev) => {
      const exists = prev.find(s => s.shiftId === shiftId);
      if (exists) {
        return prev.filter(s => s.shiftId !== shiftId);
      } else {
        return [...prev, { shiftId, gender: 'All' }];
      }
    });
  };

  const updateDesignationShiftGender = (shiftId: string, gender: string) => {
    setSelectedDesignationShifts(prev => prev.map(s => s.shiftId === shiftId ? { ...s, gender } : s));
  };

  const handleOpenDesignationShiftDialog = (designation: Designation) => {
    setShowDesignationShiftDialog(designation);
    loadShifts();
    // Parse existing shifts for this designation/scope
    let existingShifts = [];
    if (showDesignationDialog === 'global' || !showDesignationDialog) {
      // Global defaults
      existingShifts = designation.shifts || [];
    } else {
      // Find override for this department
      const deptOverride = designation.departmentShifts?.find(ds =>
        (typeof ds.department === 'string' ? ds.department : ds.department._id) === showDesignationDialog
      );
      if (deptOverride) {
        existingShifts = deptOverride.shifts || [];
      } else {
        // Fallback to global if no override?? Or empty? Usually empty if creating new override.
        // But if we want to show global assignments as pre-selected?
        // Current logic was: `designation.shifts` (Global) ??
        // Wait, line 585 in original code used `designation.shifts`.
        // But if I am effectively *editing* parameters for a specific department, I should load THAT department's params if they exist.
        // If they don't exist, I start clean (or maybe copy global).
        // Let's stick to what was there but parse it correctly.
        existingShifts = designation.shifts || [];
      }
    }

    // Actually, line 585 was simply: `designation.shifts`. It didn't seem to account for scope overrides in loading!
    // That might be a bug or feature of the original code. Let's fix it to load correct scope if possible, or just keep it simple.
    // Given I am replacing logic, I will stick to `designation.shifts` for now to avoid breaking behavior, but parses properly.

    const assignedShifts = existingShifts.map((s: any) => {
      if (typeof s === 'string') return { shiftId: s, gender: 'All' };
      if (s.shiftId) {
        const sId = typeof s.shiftId === 'string' ? s.shiftId : (s.shiftId as Shift)._id;
        return { shiftId: sId, gender: s.gender || 'All' };
      }
      return { shiftId: s._id, gender: 'All' };
    });
    setSelectedDesignationShifts(assignedShifts);
    setError('');
  };

  const handleAssignDesignationShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDesignationShiftDialog) return;
    setError('');

    try {
      const response = await api.assignShiftsToDesignation(
        showDesignationShiftDialog._id,
        selectedDesignationShifts,
        showDesignationDialog === 'global' ? undefined : (showDesignationDialog || undefined)
      );

      if (response.success) {
        setShowDesignationShiftDialog(null);
        setSelectedDesignationShifts([]);

        // Update local state directly with the returned populated designation
        if (response.data) {
          setDesignations(prev => prev.map(d => d._id === response.data._id ? response.data : d));
        } else if (showDesignationDialog && showDesignationDialog !== 'global') {
          loadDesignations(showDesignationDialog);
        }
      } else {
        setError(response.message || 'Failed to assign shifts');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const hodUsers = users.filter((u) => u.role === 'hod' || u.roles?.includes('hod'));

  const stats = useMemo(() => {
    const linkedRoles = departments.reduce((acc, d) => acc + (d.designations?.length || 0), 0);
    return {
      total: departments.length,
      linkedRoles,
      avgRoles: departments.length ? Math.round(linkedRoles / departments.length) : 0,
      withHod: departments.filter((d) => d.hod || (d.divisionHODs && d.divisionHODs.length > 0)).length,
    };
  }, [departments]);

  const closeCreateDialog = () => {
    setShowCreateDialog(false);
    resetDepartmentForm();
  };

  const closeEditDialog = () => {
    setShowEditDialog(null);
    resetDepartmentForm();
  };

  const closeDesignationDialog = () => {
    setShowDesignationDialog(null);
    resetDesignationForm();
    setExistingDesignationSearch('');
    setShowLinkDesignationDialog(null);
    setSelectedLinkDesignationId('');
    setLinkDesignationSearch('');
  };

  const isDeptLinked = (dept: Department) =>
    selectedDivisionId === 'all' ||
    dept.divisions?.some(
      (divId) => (typeof divId === 'string' ? divId : (divId as Division)._id) === selectedDivisionId,
    );

  const renderDepartmentFormFields = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <LoanFormLabel>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3 w-3" />
              Name *
            </span>
          </LoanFormLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={loansFormInputClass()}
            style={loansFormInputStyle()}
            placeholder="e.g. Engineering"
          />
        </div>
        <div>
          <LoanFormLabel>
            <span className="inline-flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              Code
            </span>
          </LoanFormLabel>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={loansFormInputClass()}
            style={loansFormInputStyle()}
            placeholder="e.g. ENG"
          />
        </div>
        <div className="md:col-span-2">
          <LoanFormLabel>
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" />
              Description
            </span>
          </LoanFormLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={loansFormInputClass()}
            style={loansFormInputStyle()}
            placeholder="Optional notes"
          />
        </div>
      </div>
      {divisions.length > 0 ? (
        <LoanFormPanel soft className="!p-4">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Division HOD assignments
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {divisions.map((division) => (
              <div key={division._id}>
                <LoanFormLabel>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {division.name}
                  </span>
                </LoanFormLabel>
                <select
                  value={divisionHODMap[division._id] || ''}
                  onChange={(e) => setDivisionHODMap((prev) => ({ ...prev, [division._id]: e.target.value }))}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="">No HOD</option>
                  {hodUsers.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </LoanFormPanel>
      ) : null}
      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Organization"
        title="Departments"
        subtitle="Manage departments, designations, and shift assignments"
        action={
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBulkUploadDept(true)}
              className={ledgerOutlineBtn}
              style={ledgerBorder}
            >
              <Upload className="h-3 w-3" />
              <span className="hidden sm:inline">Bulk import</span>
              <span className="sm:hidden">Import</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetDepartmentForm();
                setShowCreateDialog(true);
              }}
              className={`inline-flex items-center gap-1 ${loansPrimaryButtonClass()}`}
              style={loansPrimaryButtonStyle()}
            >
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New department</span>
            </button>
          </div>
        }
      />

      <LoansStatGrid
        columns={4}
        stats={[
          { label: 'Total departments', value: stats.total, accent: true },
          { label: 'Linked roles', value: stats.linkedRoles, highlight: true },
          { label: 'Avg roles / dept', value: stats.avgRoles },
          { label: 'With HOD', value: stats.withHod, muted: true },
        ]}
      />

      <LoanDetailDialog open={showCreateDialog} onClose={closeCreateDialog} maxWidth="max-w-2xl" layerClass="z-[100]">
        <form onSubmit={handleCreateDepartment} className="flex min-h-0 flex-1 flex-col">
          <LoanDetailDialogHeader
            badge="Department"
            title="New department"
            subtitle="Configure name, code, and division HODs"
            onClose={closeCreateDialog}
          />
          <LoanDetailDialogBody>{renderDepartmentFormFields()}</LoanDetailDialogBody>
          <LoanDialogFooter onCancel={closeCreateDialog} submitLabel="Create department" />
        </form>
      </LoanDetailDialog>

      <LoanDetailDialog open={!!showEditDialog} onClose={closeEditDialog} maxWidth="max-w-2xl" layerClass="z-[100]">
        <form onSubmit={handleUpdateDepartment} className="flex min-h-0 flex-1 flex-col">
          <LoanDetailDialogHeader
            badge="Department"
            title="Edit department"
            subtitle="Update organizational parameters"
            onClose={closeEditDialog}
          />
          <LoanDetailDialogBody>{renderDepartmentFormFields()}</LoanDetailDialogBody>
          <LoanDialogFooter onCancel={closeEditDialog} submitLabel="Save changes" />
        </form>
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!showLinkDesignationDialog}
        onClose={() => setShowLinkDesignationDialog(null)}
        maxWidth="max-w-md"
        layerClass="z-[110]"
      >
        <LoanDetailDialogHeader
          badge="Designation"
          title="Link designation"
          subtitle="Add an existing role to this department"
          onClose={() => setShowLinkDesignationDialog(null)}
        />
        <LoanDetailDialogBody>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {unlinkedDesignations.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-500">No unlinked designations available.</p>
            ) : (
              unlinkedDesignations.map((d) => (
                <div
                  key={d._id}
                  className="flex items-center justify-between border bg-white p-3 dark:bg-stone-950"
                  style={ledgerBorder}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Briefcase className="h-4 w-4 shrink-0 text-stone-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-stone-900 dark:text-stone-100">{d.name}</p>
                      {d.code ? <p className="text-xs text-stone-500">{d.code}</p> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLinkDesignation(d._id)}
                    className={loansDialogOutlineButtonClass()}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Link
                  </button>
                </div>
              ))
            )}
          </div>
        </LoanDetailDialogBody>
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!showShiftDialog}
        onClose={() => {
          setShowShiftDialog(null);
          setSelectedShifts([]);
        }}
        maxWidth="max-w-2xl"
        layerClass="z-[100]"
      >
        {showShiftDialog ? (
          <form onSubmit={handleAssignShifts} className="flex min-h-0 flex-1 flex-col">
            <LoanDetailDialogHeader
              badge="Shifts"
              title="Assign shifts"
              subtitle={`${showShiftDialog.name} — select shifts and scope`}
              onClose={() => {
                setShowShiftDialog(null);
                setSelectedShifts([]);
              }}
            />
            <LoanDetailDialogBody>
              <div className="space-y-5">
                  {/* Scope Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Target Scope</label>
                    <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
                      {(['department', 'designation'] as const).map((scope) => (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => {
                            setTargetScope(scope);
                            // setSelectedShifts([]); // Removed to let useEffect handle it
                            // Reset target IDs when switching scope
                            if (scope === 'department') {
                              setTargetDivisionId('');
                            }
                          }}
                          className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all ${targetScope === scope
                            ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-400'
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                            }`}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                      {targetScope === 'department' && "Specific overrides for this Department."}
                      {targetScope === 'designation' && "Fine-grained overrides for a specific Designation."}
                    </p>
                  </div>

                  {/* Division Selector (Required for Designation scope) */}
                  {(targetScope === 'designation' || (targetScope === 'department' && (showShiftDialog.divisions?.length ?? 0) > 0)) && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {/* Optional context for Department, Required for Designation if mult-div */}
                        Context Division (Optional)
                      </label>
                      <select
                        value={targetDivisionId}
                        onChange={(e) => setTargetDivisionId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        required={targetScope === 'designation'}
                      >
                        <option value="">Select Division</option>
                        {showShiftDialog.divisions?.map((divId: string | Division) => {
                          const div = typeof divId === 'string' ? divisions.find(d => d._id === divId) : divId;
                          const dId = typeof div === 'string' ? div : (div?._id || '');
                          const dName = typeof div === 'string' ? 'Unknown Division' : (div?.name || 'Unknown Division');
                          return (
                            <option key={dId} value={dId}>
                              {dName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Designation Selector (For Designation scope) */}
                  {targetScope === 'designation' && (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Select Designation
                      </label>
                      <select
                        value={targetDesignationId}
                        onChange={(e) => setTargetDesignationId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        required
                      >
                        <option value="">Select Designation</option>
                        {designations.map((desig) => (
                          <option key={desig._id} value={desig._id}>
                            {desig.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Shifts
                    </label>
                    {loadingShifts ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-12 dark:border-slate-700 dark:bg-slate-900/50">
                        <Spinner />
                        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading shifts...</p>
                      </div>
                    ) : shifts.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No shifts available in the database.</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Please create shifts first from the Shifts page.</p>
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/30 p-4 dark:border-slate-700 dark:bg-slate-900/30">
                        {shifts.map((shift) => (
                          <label
                            key={shift._id}
                            className={`group flex flex-col gap-2 rounded-2xl border p-4 transition-all ${selectedShifts.some(s => s.shiftId === shift._id)
                              ? 'border-blue-300 bg-blue-50/50 shadow-md shadow-blue-100 dark:border-blue-700 dark:bg-blue-900/20'
                              : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                              }`}
                          >
                            <div className="flex cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedShifts.some(s => s.shiftId === shift._id)}
                                onChange={() => toggleShiftSelection(shift._id)}
                                className="h-5 w-5 rounded-lg border-slate-300 text-blue-600 transition-all focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:border-slate-600"
                              />
                              <div className="flex-1">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">{shift.name}</div>
                                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                  {shift.startTime} - {shift.endTime} ({shift.duration} hours)
                                </div>
                                {!shift.isActive && (
                                  <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                    Inactive
                                  </span>
                                )}
                              </div>
                            </div>
                            {selectedShifts.some(s => s.shiftId === shift._id) && (
                              <div className="ml-8 mt-2 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Gender:</label>
                                <select
                                  value={selectedShifts.find(s => s.shiftId === shift._id)?.gender || 'All'}
                                  onChange={(e) => updateShiftGender(shift._id, e.target.value)}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <option value="All">All Genders</option>
                                  <option value="Male">Male Only</option>
                                  <option value="Female">Female Only</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedShifts.length > 0 && (
                    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        <span className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                          {selectedShifts.length}
                        </span>
                        shift(s) selected
                      </p>
                    </div>
                  )}

                  {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
              </div>
            </LoanDetailDialogBody>
            <LoanDialogFooter
              onCancel={() => {
                setShowShiftDialog(null);
                setSelectedShifts([]);
              }}
              submitLabel="Assign shifts"
            />
          </form>
        ) : null}
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!showDesignationDialog}
        onClose={closeDesignationDialog}
        maxWidth="max-w-6xl"
        layerClass="z-[100]"
      >
        <LoanDetailDialogHeader
          badge="Designation"
          title={showDesignationDialog === 'global' ? 'Global designations' : 'Manage designations'}
          subtitle={
            showDesignationDialog === 'global'
              ? 'Create independent roles used across departments'
              : 'Create and manage roles for this department'
          }
          onClose={closeDesignationDialog}
        />
        <div
          className="grid max-h-[calc(92vh-8rem)] grid-cols-1 divide-y overflow-hidden lg:grid-cols-2 lg:divide-x lg:divide-y-0"
          style={{ borderColor: 'var(--ps-accent-border)' }}
        >
          <div className="overflow-y-auto p-4 sm:p-5">
            <LoanFormPanel soft className="!p-4 sm:!p-5">
              <h3 className="mb-4 flex items-center gap-2 font-serif text-lg font-light text-stone-900 dark:text-stone-100">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md border"
                  style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}
                >
                  <Plus className="h-4 w-4" />
                </span>
                Add new designation
              </h3>
              <form onSubmit={handleCreateDesignation} className="space-y-4">
                <div>
                  <LoanFormLabel>Designation name *</LoanFormLabel>
                  <input
                    type="text"
                    value={designationName}
                    onChange={(e) => setDesignationName(e.target.value)}
                    required
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                    placeholder="e.g. Senior Developer"
                  />
                </div>
                <div>
                  <LoanFormLabel>Designation code</LoanFormLabel>
                  <input
                    type="text"
                    value={designationCode}
                    onChange={(e) => setDesignationCode(e.target.value.toUpperCase())}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                    placeholder="e.g. SR-DEV"
                  />
                </div>
                <div>
                  <LoanFormLabel>Description</LoanFormLabel>
                  <textarea
                    value={designationDescription}
                    onChange={(e) => setDesignationDescription(e.target.value)}
                    rows={3}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                    placeholder="Role description..."
                  />
                </div>
                <div>
                  <LoanFormLabel>Paid leaves</LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    value={designationPaidLeaves}
                    onChange={(e) => setDesignationPaidLeaves(Number(e.target.value))}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                  />
                </div>
                {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
                <button
                  type="submit"
                  className={`${loansDialogPrimaryButtonClass(true)} gap-2`}
                  style={loansDialogPrimaryButtonStyle()}
                >
                  <Plus className="h-4 w-4" />
                  Add designation
                </button>
              </form>
            </LoanFormPanel>
          </div>

          <div
            className="overflow-y-auto p-4 sm:p-5"
            style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.02)' }}
          >
            <h3 className="mb-4 flex items-center gap-2 font-serif text-lg font-light text-stone-900 dark:text-stone-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-400">
                <Users className="h-4 w-4" />
              </span>
              Existing designations
                      {designations.length > 0 && (
                        <span className="ml-auto rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {designations.length}
                        </span>
                      )}
                    </h3>

                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        placeholder="Search by name or code..."
                        value={existingDesignationSearch}
                        onChange={(e) => setExistingDesignationSearch(e.target.value)}
                        className={`${loansFormInputClass()} !pl-9`}
                        style={loansFormInputStyle()}
                      />
                    </div>

                    {/* Add Link Designation Button if not global */}
                    {showDesignationDialog !== 'global' && (
                      <div className="mb-4">
                        <button
                          type="button"
                          onClick={() => {
                            if (showDesignationDialog) {
                              loadUnlinkedDesignations(showDesignationDialog);
                              setShowLinkDesignationDialog(showDesignationDialog);
                            }
                          }}
                          className={`${loansDialogOutlineButtonClass()} w-full justify-center`}
                          style={loansDialogOutlineButtonStyle()}
                        >
                          <Link2 className="h-4 w-4" />
                          Link existing designation
                        </button>
                      </div>
                    )}

                    {/* Manual Linking Form (Inline) */}
                    {showLinkDesignationDialog === showDesignationDialog && (
                      <LoanFormPanel soft className="mb-4 !p-4">
                        <LoanDetailSectionTitle>Link designation to department</LoanDetailSectionTitle>
                        <div className="space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              placeholder="Search designations..."
                              value={linkDesignationSearch}
                              onChange={(e) => setLinkDesignationSearch(e.target.value)}
                              className={`${loansFormInputClass()} !pl-9`}
                              style={loansFormInputStyle()}
                            />
                          </div>
                          <div>
                            <select
                              value={selectedLinkDesignationId}
                              onChange={(e) => setSelectedLinkDesignationId(e.target.value)}
                              className={loansFormInputClass()}
                              style={loansFormInputStyle()}
                            >
                              <option value="">Select a designation...</option>
                              {(() => {
                                const filtered = unlinkedDesignations.filter((d) => {
                                  const search = linkDesignationSearch.toLowerCase();
                                  if (!search) return true;
                                  const name = (d.name || '').toLowerCase();
                                  const code = (d.code || '').toLowerCase();
                                  return name.includes(search) || code.includes(search);
                                });
                                return filtered.length === 0 ? (
                                  <option disabled>No matching designations found</option>
                                ) : (
                                  filtered.map((d) => (
                                    <option key={d._id} value={d._id}>
                                      {d.name} {d.code ? `(${d.code})` : ''}
                                    </option>
                                  ))
                                );
                              })()}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleLinkDesignation(selectedLinkDesignationId)}
                              disabled={!selectedLinkDesignationId}
                              className={`flex-1 ${loansDialogPrimaryButtonClass()}`}
                              style={loansDialogPrimaryButtonStyle()}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowLinkDesignationDialog(null);
                                setSelectedLinkDesignationId('');
                                setLinkDesignationSearch('');
                              }}
                              className={`flex-1 ${loansDialogSecondaryButtonClass()}`}
                              style={loansDialogSecondaryButtonStyle()}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </LoanFormPanel>
                    )}

                    {loadingDesignations ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
                        <Spinner />
                        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading designations...</p>
                      </div>
                    ) : (() => {
                      const filteredDesignations = designations.filter((d) => {
                        const search = existingDesignationSearch.toLowerCase();
                        if (!search) return true;
                        const name = (d.name || '').toLowerCase();
                        const code = (d.code || '').toLowerCase();
                        return name.includes(search) || code.includes(search);
                      });
                      return filteredDesignations.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                            <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                            {designations.length === 0 ? 'No designations yet' : 'No matching designations found'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                            {designations.length === 0 ? 'Create your first designation using the form' : 'Try adjusting your search'}
                          </p>
                        </div>
                      ) : (
                      <div className="space-y-3">
                        {filteredDesignations.map((designation) => (
                          <div
                            key={designation._id}
                            className="border bg-white p-4 transition-all hover:shadow-sm dark:bg-stone-950"
                            style={ledgerBorder}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{designation.name}</h4>
                                  <span
                                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${designation.isActive
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                      }`}
                                  >
                                    {designation.isActive ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                {designation.code && (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Code: {designation.code}</p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {designation.paidLeaves} leaves
                                  </span>
                                  {/* Global Shifts */}
                                  {designation.shifts && designation.shifts.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full">Global Defaults</span>
                                      {(designation.shifts as any[])?.map((s: any) => {
                                        const shift = s.shiftId ? (s.shiftId as Shift) : (s as Shift);
                                        const gender = s.gender || 'All';
                                        if (!shift || !shift.name) return null;
                                        return (
                                          <button
                                            key={shift._id}
                                            onClick={() => setShowShiftBreakdownDialog(designation)}
                                            className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10 hover:bg-purple-100 transition-colors dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/20 dark:hover:bg-purple-400/20 cursor-pointer"
                                            title={`Gender: ${gender}`}
                                          >
                                            {shift.name} {shift.startTime ? `(${shift.startTime})` : ''}
                                            {gender !== 'All' && <span className="ml-1 text-[10px] text-purple-500">({gender.charAt(0)})</span>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {/* Department-Specific Shifts */}
                                  {designation.departmentShifts && designation.departmentShifts.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full">Dept Overrides</span>
                                      {designation.departmentShifts.flatMap((ds) =>
                                        (ds.shifts as any[] | undefined)?.map((s: any) => {
                                          const shift = s.shiftId ? (s.shiftId as Shift) : (s as Shift);
                                          const gender = s.gender || 'All';
                                          if (!shift || !shift.name) return null;
                                          return (
                                            <button
                                              key={`${(ds.department as any)._id}-${shift._id}`}
                                              onClick={() => setShowShiftBreakdownDialog(designation)}
                                              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10 hover:bg-emerald-100 transition-colors dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20 dark:hover:bg-emerald-400/20 cursor-pointer"
                                              title={`${(ds.division as any)?.name ? `${(ds.division as any).name} > ` : ''}${(ds.department as any).name} | Gender: ${gender}`}
                                            >
                                              {shift.name} {ds.division ? `(${(ds.division as any).code} > ${(ds.department as any).code || 'Dept'})` : `(${(ds.department as any).name})`}
                                              {gender !== 'All' && <span className="ml-1 text-[10px] text-emerald-500">({gender.charAt(0)})</span>}
                                            </button>
                                          );
                                        }) || []
                                      )}

                                      {/* Division Defaults */}
                                      {designation.divisionDefaults && designation.divisionDefaults.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full">Division Defaults</span>
                                          {designation.divisionDefaults.map((dd: any) =>
                                            (dd.shifts as Shift[] | undefined)?.map((shift: Shift) => (
                                              <button
                                                key={`${dd.division?._id || dd.division}-${shift._id}`}
                                                onClick={() => setShowShiftBreakdownDialog(designation)}
                                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-700/10 hover:bg-amber-100 transition-colors dark:bg-amber-900/10 dark:text-amber-400 dark:ring-amber-900/20 dark:hover:bg-amber-900/20 cursor-pointer"
                                                title={`Division: ${dd.division?.name || 'Unknown'}`}
                                              >
                                                {shift.name} ({dd.division?.code || 'Div'})
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      )}


                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDesignation(designation)}
                                  className={ledgerActionButtonClass('rose')}
                                  title="Delete designation"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDesignationShiftDialog(designation)}
                                  className={ledgerActionButtonClass('amber')}
                                  title="Manage shifts"
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      );
                    })()}
          </div>
        </div>
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!showDesignationShiftDialog}
        onClose={() => {
          setShowDesignationShiftDialog(null);
          setSelectedDesignationShifts([]);
        }}
        maxWidth="max-w-lg"
        layerClass="z-[110]"
      >
        {showDesignationShiftDialog ? (
          <form onSubmit={handleAssignDesignationShifts} className="flex min-h-0 flex-1 flex-col">
            <LoanDetailDialogHeader
              badge="Shifts"
              title="Assign designation shifts"
              subtitle={showDesignationShiftDialog.name}
              onClose={() => {
                setShowDesignationShiftDialog(null);
                setSelectedDesignationShifts([]);
              }}
            />
            <LoanDetailDialogBody>
              <div className="space-y-5">
                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select Shifts (Optional - overrides department shifts)
                    </label>
                    {loadingShifts ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/50 py-8 dark:border-slate-700 dark:bg-slate-900/50">
                        <Spinner />
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading shifts...</p>
                      </div>
                    ) : shifts.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No shifts available.</p>
                        <p className="mt-1 text-xs text-slate-500">Create shifts first from the Shifts page.</p>
                      </div>
                    ) : (
                      <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/30 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                        {shifts.map((shift) => (
                          <label
                            key={shift._id}
                            className={`group flex flex-col gap-2 rounded-xl border p-3 transition-all ${selectedDesignationShifts.some(s => s.shiftId === shift._id)
                              ? 'border-purple-300 bg-purple-50/50 shadow-sm dark:border-purple-700 dark:bg-purple-900/20'
                              : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-purple-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                              }`}
                          >
                            <div className="flex cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={selectedDesignationShifts.some(s => s.shiftId === shift._id)}
                                onChange={() => toggleDesignationShiftSelection(shift._id)}
                                className="h-4 w-4 rounded border-slate-300 text-purple-600 transition-all focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 dark:border-slate-600"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{shift.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {shift.startTime} - {shift.endTime} ({shift.duration}h)
                                </div>
                              </div>
                              {!shift.isActive && (
                                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {
                              selectedDesignationShifts.some(s => s.shiftId === shift._id) && (
                                <div className="ml-7 mt-2" onClick={(e) => e.preventDefault()}>
                                  <select
                                    value={selectedDesignationShifts.find(s => s.shiftId === shift._id)?.gender || 'All'}
                                    onChange={(e) => updateDesignationShiftGender(shift._id, e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-purple-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    <option value="All">All Genders</option>
                                    <option value="Male">Male Only</option>
                                    <option value="Female">Female Only</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>
                              )
                            }
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedDesignationShifts.length > 0 && (
                    <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3 dark:border-purple-800 dark:from-purple-900/20 dark:to-indigo-900/20">
                      <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                        <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                          {selectedDesignationShifts.length}
                        </span>
                        shift(s) selected
                      </p>
                    </div>
                  )}

                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    <strong>Note:</strong> If shifts are assigned to a designation, they will override the department&apos;s default shifts for employees with this designation.
                  </p>

                  {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
              </div>
            </LoanDetailDialogBody>
            <LoanDialogFooter
              onCancel={() => {
                setShowDesignationShiftDialog(null);
                setSelectedDesignationShifts([]);
              }}
              submitLabel="Save shifts"
            />
          </form>
        ) : null}
      </LoanDetailDialog>

      <LoanDetailDialog
        open={!!showShiftBreakdownDialog}
        onClose={() => setShowShiftBreakdownDialog(null)}
        maxWidth="max-w-2xl"
        layerClass="z-[120]"
      >
        {showShiftBreakdownDialog ? (
          <>
            <LoanDetailDialogHeader
              badge="Shifts"
              title="Shift assignments"
              subtitle={showShiftBreakdownDialog.name}
              onClose={() => setShowShiftBreakdownDialog(null)}
            />
            <LoanDetailDialogBody>
                <div className="space-y-4">
                  {/* Global Shifts Section */}
                  {showShiftBreakdownDialog.shifts && showShiftBreakdownDialog.shifts.length > 0 && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                      <h3 className="mb-3 font-semibold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Global Defaults
                        <span className="ml-auto text-xs bg-purple-100 px-2 py-0.5 rounded-full dark:bg-purple-900/50">
                          All Departments
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {(showShiftBreakdownDialog.shifts as any[]).map((s: any) => {
                          const shift = s.shiftId ? (s.shiftId as Shift) : (s as Shift);
                          const gender = s.gender || 'All';
                          if (!shift || !shift.name) return null;
                          return (
                            <div key={shift._id} className="flex items-center justify-between rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-slate-900">
                              <div>
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                  {shift.name}
                                  {gender !== 'All' && <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full dark:bg-purple-900/30 dark:text-purple-300">{gender} Only</span>}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {shift.startTime} - {shift.endTime} ({shift.duration}h)
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Department-Specific Shifts Section */}
                  {showShiftBreakdownDialog.departmentShifts && showShiftBreakdownDialog.departmentShifts.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Department Overrides
                        <span className="ml-auto text-xs bg-emerald-100 px-2 py-0.5 rounded-full dark:bg-emerald-900/50">
                          {showShiftBreakdownDialog.departmentShifts.length} {showShiftBreakdownDialog.departmentShifts.length === 1 ? 'Department' : 'Departments'}
                        </span>
                      </h3>
                      {showShiftBreakdownDialog.departmentShifts.map((ds) => (
                        <div key={(ds.department as any)._id} className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                          <h4 className="mb-3 font-medium text-emerald-900 dark:text-emerald-300">
                            {(ds.department as any).name} {(ds.department as any).code && `(${(ds.department as any).code})`}
                          </h4>
                          <div className="space-y-2">
                            {ds.shifts && ds.shifts.length > 0 ? (
                              (ds.shifts as any[]).map((s: any) => {
                                const shift = s.shiftId ? (s.shiftId as Shift) : (s as Shift);
                                const gender = s.gender || 'All';
                                if (!shift || !shift.name) return null;
                                return (
                                  <div key={shift._id} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-700 dark:bg-slate-900">
                                    <div>
                                      <p className="font-medium text-slate-900 dark:text-slate-100">
                                        {shift.name}
                                        {gender !== 'All' && <span className="ml-2 text-xs font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full dark:bg-emerald-900/30 dark:text-emerald-300">{gender} Only</span>}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {shift.startTime} - {shift.endTime} ({shift.duration}h)
                                      </p>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-xs text-slate-500 italic">No shifts assigned</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(!showShiftBreakdownDialog.shifts || showShiftBreakdownDialog.shifts.length === 0) &&
                    (!showShiftBreakdownDialog.departmentShifts ||
                      showShiftBreakdownDialog.departmentShifts.length === 0) && (
                      <div
                        className="border border-dashed p-8 text-center"
                        style={ledgerBorder}
                      >
                        <p className="text-sm text-stone-500 dark:text-stone-400">
                          No shifts assigned to this designation yet
                        </p>
                      </div>
                    )}
                </div>
            </LoanDetailDialogBody>
          </>
        ) : null}
      </LoanDetailDialog>

      <LoansContentPanel>
        <div className="flex flex-col gap-3 border-b px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:px-4" style={ledgerBorder}>
          <LoansSectionTitle>All departments</LoansSectionTitle>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:justify-end">
            <select
              value={selectedDivisionId}
              onChange={(e) => setSelectedDivisionId(e.target.value)}
              className={`h-7 min-w-[10rem] flex-1 text-xs sm:max-w-[14rem] sm:flex-none ${loansFormInputClass()}`}
              style={loansFormInputStyle()}
            >
              <option value="all">All divisions</option>
              {divisions.map((div) => (
                <option key={div._id} value={div._id}>
                  {div.name} ({div.code})
                </option>
              ))}
            </select>
            <div className="hidden items-center gap-0.5 border p-0.5 sm:flex" style={ledgerBorder}>
              {(['cards', 'table'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition"
                  style={
                    viewMode === mode
                      ? { backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }
                      : { color: 'rgb(120 113 108)' }
                  }
                >
                  {mode}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowBulkUploadDesig(true)} className={ledgerOutlineBtn} style={ledgerBorder}>
              <Upload className="h-3 w-3" />
              <span className="hidden sm:inline">Import roles</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenDesignationDialog('global')}
              className={`${loansPrimaryButtonClass()} inline-flex items-center gap-1`}
              style={loansPrimaryButtonStyle()}
            >
              <Plus className="h-3 w-3" />
              <span className="hidden sm:inline">Global roles</span>
              <span className="sm:hidden">Roles</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12 sm:py-16">
            <Spinner />
          </div>
        ) : departments.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center sm:py-16">
            <Building2 className="mb-2 h-8 w-8 text-stone-300 sm:h-10 sm:w-10" />
            <p className="font-serif text-base font-light text-stone-800 dark:text-stone-100 sm:text-lg">No departments yet</p>
            <p className="mt-1 text-xs text-stone-500 sm:text-sm">Create your first department from the header.</p>
          </div>
        ) : (
          <>
            {viewMode === 'table' ? (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-xs">
              <thead>
                <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                  <th className="px-3 py-2 text-center">Icon</th>
                  <th className="px-3 py-2 text-left">Department</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Divisions</th>
                  <th className="px-3 py-2 text-center">Roles</th>
                  <th className={`px-3 py-2 ${ledgerTableActionsHeaderClass('right')}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-stone-800" style={ledgerBorder}>
                {departments.map((dept) => {
                  const linked = isDeptLinked(dept);
                  const initials = (dept.code || dept.name.substring(0, 2)).substring(0, 2).toUpperCase();
                  return (
                    <tr
                      key={dept._id}
                      className={`transition-colors hover:bg-[var(--ps-accent-soft)]/30 ${!linked ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-2 text-center">
                        <div
                          className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border text-xs font-bold"
                          style={{
                            borderColor: 'var(--ps-accent-border)',
                            backgroundColor: 'var(--ps-accent-soft)',
                            color: 'var(--ps-accent)',
                          }}
                        >
                          {initials}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-stone-900 dark:text-stone-100">{dept.name}</div>
                        {dept.description ? (
                          <div className="max-w-[200px] truncate text-[10px] text-stone-500">{dept.description}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-stone-600">{dept.code || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex max-w-[180px] flex-wrap gap-0.5">
                          {dept.divisions?.length ? (
                            dept.divisions.map((div: Division | string) => {
                              const id = typeof div === 'string' ? div : div._id;
                              const label = typeof div === 'string' ? 'DIV' : div.code || 'DIV';
                              return (
                                <span key={id} className={ledgerStatusBadgeClass('neutral')}>
                                  {label}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[10px] text-stone-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenDesignationDialog(dept._id)}
                          className={`inline-flex items-center gap-1 ${ledgerStatusBadgeClass('approved')}`}
                        >
                          <Briefcase className="h-3 w-3" />
                          {dept.designations?.length || 0}
                        </button>
                      </td>
                      <td className={`px-3 py-2 ${ledgerTableActionsCellClass('right')}`}>
                        <DeptRowActions
                            onShifts={() => handleOpenShiftDialog(dept)}
                            onEdit={() => handleOpenEditDialog(dept)}
                            onDelete={() => void handleDeleteDepartment(dept._id)}
                          />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            ) : null}

            <div
              className={`grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 lg:grid-cols-3 xl:grid-cols-4 ${
                viewMode === 'table' ? 'md:hidden' : ''
              }`}
            >
              {departments.map((dept) => (
                <DepartmentCard
                  key={dept._id}
                  dept={dept}
                  isLinked={!!isDeptLinked(dept)}
                  onCardClick={() => void handleCardClick(dept)}
                  onEdit={() => handleOpenEditDialog(dept)}
                  onDelete={() => void handleDeleteDepartment(dept._id)}
                  onRoles={() => handleOpenDesignationDialog(dept._id)}
                  onShifts={() => handleOpenShiftDialog(dept)}
                />
              ))}
            </div>
          </>
        )}
      </LoansContentPanel>

        {/* Bulk Upload Departments Dialog */}
        {showBulkUploadDept && (
          <BulkUpload
            ledgerUi
            title="Bulk Upload Departments"
            templateHeaders={DEPARTMENT_TEMPLATE_HEADERS}
            templateSample={DEPARTMENT_TEMPLATE_SAMPLE}
            templateFilename="department_template"
            columns={[
              { key: 'name', label: 'Department Name', width: '200px' },
              { key: 'code', label: 'Code', width: '100px' },
              { key: 'description', label: 'Description', width: '300px' },
            ]}
            validateRow={(row) => {
              const result = validateDepartmentRow(row);
              return { isValid: result.isValid, errors: result.errors, fieldErrors: result.fieldErrors };
            }}
            onSubmit={async (data) => {
              let successCount = 0;
              let failCount = 0;
              const errors: string[] = [];

              for (const row of data) {
                try {
                  const deptData = {
                    name: row.name as string,
                    code: row.code as string || undefined,
                    description: row.description as string || undefined,
                  };

                  const response = await api.createDepartment(deptData);
                  if (response.success) {
                    successCount++;
                  } else {
                    failCount++;
                    errors.push(`${row.name}: ${response.message}`);
                  }
                } catch (err) {
                  failCount++;
                  errors.push(`${row.name}: Failed to create`);
                }
              }

              loadDepartments();

              if (failCount === 0) {
                return { success: true, message: `Successfully created ${successCount} departments` };
              } else {
                return { success: false, message: `Created ${successCount}, Failed ${failCount}. Errors: ${errors.slice(0, 3).join('; ')}` };
              }
            }}
            onClose={() => setShowBulkUploadDept(false)}
          />
        )}

        {/* Bulk Upload Designations Dialog */}
        {showBulkUploadDesig && (
          <BulkUpload
            ledgerUi
            title="Bulk Upload Designations"
            templateHeaders={DESIGNATION_TEMPLATE_HEADERS}
            templateSample={DESIGNATION_TEMPLATE_SAMPLE}
            templateFilename="designation_template"
            columns={[
              { key: 'name', label: 'Designation Name', width: '220px' },
              { key: 'code', label: 'Code', width: '120px' },
              { key: 'description', label: 'Description', width: '300px' },
              { key: 'paid_leaves', label: 'Paid Leaves', type: 'number', width: '100px' },
            ]}
            validateRow={(row) => {
              const result = validateDesignationRow(row);
              return { isValid: result.isValid, errors: result.errors, fieldErrors: result.fieldErrors, mappedRow: result.mappedRow };
            }}
            onSubmit={async (data) => {
              let successCount = 0;
              let failCount = 0;
              const errors: string[] = [];

              for (const row of data) {
                try {
                  const desigData = {
                    name: row.name as string,
                    code: row.code as string || undefined,
                    description: row.description as string || undefined,
                    paidLeaves: row.paid_leaves ? Number(row.paid_leaves) : 0,
                  };

                  const response = await api.createGlobalDesignation(desigData);
                  if (response.success) {
                    successCount++;
                  } else {
                    failCount++;
                    errors.push(`${row.name}: ${response.message}`);
                  }
                } catch (err) {
                  failCount++;
                  errors.push(`${row.name}: Failed to create`);
                }
              }

              if (failCount === 0) {
                return { success: true, message: `Successfully created ${successCount} designations` };
              } else {
                return { success: false, message: `Created ${successCount}, Failed ${failCount}. Errors: ${errors.slice(0, 3).join('; ')}` };
              }
            }}
            onClose={() => setShowBulkUploadDesig(false)}
          />
        )}
    </LoansPageShell>
  );
}
