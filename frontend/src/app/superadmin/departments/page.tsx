'use client';

import React, { useState, useEffect } from 'react';
import { api, Department, Designation, Division, Shift, User } from '@/lib/api';
import {
  X,
  Plus,
  Check,
  AlertCircle,
  MapPin,
  ShieldCheck,
  Briefcase
} from 'lucide-react';
import Swal from 'sweetalert2';
import BulkUpload from '@/components/BulkUpload';
import {
  DEPARTMENT_TEMPLATE_HEADERS,
  DEPARTMENT_TEMPLATE_SAMPLE,
  DESIGNATION_TEMPLATE_HEADERS,
  DESIGNATION_TEMPLATE_SAMPLE,
  validateDepartmentRow,
  validateDesignationRow,
} from '@/lib/bulkUpload';
import Spinner from '@/components/Spinner';

// Helper Components
function StatCard({ title, value, icon, trend, color }: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend: string;
  color: 'emerald' | 'amber' | 'blue' | 'indigo';
}) {
  const gradients = {
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/20',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/20',
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
    indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-500/20',
  };

  const bgColors = {
    emerald: 'bg-emerald-50 border-emerald-100',
    amber: 'bg-amber-50 border-amber-100',
    blue: 'bg-blue-50 border-blue-100',
    indigo: 'bg-indigo-50 border-indigo-100',
  };

  return (
    <div className="relative p-3 md:p-5 rounded-2xl md:rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group bg-white border border-slate-100 shadow-sm h-40 flex flex-col justify-between">
      <div className="flex items-start justify-between mb-2 md:mb-4">
        <div className={`w-10 h-10 md:w-8 md:h-8 rounded-xl md:rounded-xl bg-gradient-to-br ${gradients[color]} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5 md:w-6 md:h-6' }) : icon}
        </div>
      </div>
      <div>
        <p className="text-slate-500 font-semibold text-[9px] md:text-xs mb-0.5 md:mb-1 uppercase tracking-wider truncate">{title}</p>
        <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{value}</h3>
        <div className={`mt-1 md:mt-1 inline-flex items-center gap-1 md:gap-2 px-1.5 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-xs font-bold ${bgColors[color]} text-${color}-700`}>
          {trend}
        </div>
      </div>
    </div>
  );
}

// Icons
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

const UserIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const BuildingIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const UsersIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ArrowPathIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CheckBadgeIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138z" />
  </svg>
);



export default function DepartmentsPage() {
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
  const [divisionHODMap, setDivisionHODMap] = useState<Record<string, string>>({}); // { divisionId: hodId }
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

    const result = await Swal.fire({
      title: 'Link Department?',
      text: `Would you like to link "${dept.name}" to the "${divName}" division?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, link it',
      cancelButtonText: 'No, cancel',
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#ef4444',
      background: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
      color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
    });

    if (result.isConfirmed) {
      try {
        const response = await api.linkDepartmentsToDivision(selectedDivisionId, {
          departmentIds: [dept._id],
          action: 'link'
        });

        if (response.success) {
          Swal.fire({
            title: 'Linked!',
            text: `Department "${dept.name}" has been successfully linked to "${divName}".`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
            background: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b',
          });
          loadDepartments(); // Refresh list to reflect brightness change
        } else {
          Swal.fire('Error', response.message || 'Failed to link department', 'error');
        }
      } catch (err) {
        console.error('Error linking department to division:', err);
        Swal.fire('Error', 'An unexpected error occurred.', 'error');
      }
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this department?')) return;

    try {
      const response = await api.deleteDepartment(id);
      if (response.success) {
        loadDepartments();
      } else {
        alert(response.message || 'Failed to delete department');
      }
    } catch (err) {
      console.error('Error deleting department:', err);
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

  return (
    <div className="relative min-h-screen">
      {/* Background Pattern */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/40 via-indigo-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 p-6 sm:p-8 lg:p-10">
        {/* Header Section - Dashboard Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-6 mb-8">
          {/* Page Role Card */}
          <div className="md:col-span-1 bg-white p-3 md:p-6 rounded-xl md:rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-white rounded-full -mr-10 -mt-10 blur-2xl transition-all duration-500 group-hover:bg-blue-100/60" />

            <div className="relative z-10 flex items-center h-full gap-3 md:gap-5">
              <div className="w-12 h-12 md:w-16 md:h-16 md:ml-4 rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 ring-2 md:ring-4 ring-blue-50 shrink-0">
                <BuildingIcon className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              <div className="flex flex-col justify-center">
                <p className="text-slate-500 font-medium text-[10px] md:text-xs uppercase tracking-wider mb-0.5">Organization</p>
                <h3 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight capitalize">
                  Departments
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-semibold text-slate-400">Functional Units</span>
                </div>
              </div>
            </div>
          </div>
          {/* Action Card */}
          <div className="md:col-span-2 bg-gradient-to-br from-blue-500 to-indigo-600 p-3 md:p-8 rounded-xl md:rounded-3xl shadow-lg shadow-blue-500/20 border border-blue-400/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-10 -mt-10 blur-3xl transition-all duration-500 group-hover:bg-white/20" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between h-full gap-4">
              <div>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-1">Manage Workforce Structure</h3>
                <p className="text-blue-100 text-sm md:text-base opacity-90">Organize your employees into functional departments and assign roles.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkUploadDept(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20 whitespace-nowrap"
                >
                  <span>Bulk Import</span>
                </button>
                <button
                  onClick={() => { resetDepartmentForm(); setShowCreateDialog(true); }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-blue-600 shadow-xl transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
                >
                  <span className="text-xl">+</span>
                  <span>Create Department</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 mb-8">
          <StatCard
            title="Total Depts"
            value={departments.length}
            icon={<BuildingIcon />}
            trend="Active Departments"
            color="blue"
          />
          <StatCard
            title="Linked Roles"
            value={departments.reduce((acc, d) => acc + (d.designations?.length || 0), 0)}
            icon={<UsersIcon />}
            trend="Total Designations"
            color="emerald"
          />
          <StatCard
            title="Avg. Roles"
            value={departments.length ? Math.round(departments.reduce((acc, d) => acc + (d.designations?.length || 0), 0) / departments.length) : 0}
            icon={<ArrowPathIcon />}
            trend="Per Department"
            color="amber"
          />
          <StatCard
            title="Leadership"
            value={departments.filter(d => d.hod || (d.divisionHODs && d.divisionHODs.length > 0)).length}
            icon={<CheckBadgeIcon />}
            trend="Depts with HOD"
            color="indigo"
          />
        </div>

        {/* Create Department Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
              onClick={() => {
                setShowCreateDialog(false);
                resetDepartmentForm();
              }}
            />
            <div className="relative z-50 flex flex-col w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-3xl md:rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl shadow-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
              {/* Header */}
              <div className="p-5 sm:p-6 md:p-8 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    Create New <span className="text-blue-500">Department</span>
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    Configure organizational structure at scale
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                    resetDepartmentForm();
                  }}
                  className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-red-500/10"
                >
                  <X className="h-6 w-6 transition-transform group-hover:rotate-90" />
                </button>
              </div>

              {/* Form Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 custom-scrollbar">
                <form id="createDepartmentForm" onSubmit={handleCreateDepartment} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <BuildingIcon className="w-3.5 h-3.5" />
                        Department Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="e.g., Engineering"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Department Code
                      </label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="e.g., ENG, MKT, SALES"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <Briefcase className="w-3.5 h-3.5" />
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="What define's this department's mission?"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[2rem] border border-blue-100 bg-blue-50/30 p-6 dark:border-blue-900/30 dark:bg-blue-900/10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Division HOD Assignments
                        </h3>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Delegate management authority per division
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {divisions.map((division) => (
                        <div key={division._id} className="space-y-1.5 p-4 rounded-2xl bg-white border border-slate-100 dark:bg-slate-900 dark:border-slate-800/50">
                          <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {division.name}
                          </label>
                          <select
                            value={divisionHODMap[division._id] || ''}
                            onChange={(e) => setDivisionHODMap(prev => ({ ...prev, [division._id]: e.target.value }))}
                            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="">No Specific HOD</option>
                            {hodUsers.map((user) => (
                              <option key={user._id} value={user._id}>
                                {user.name} ({user.email.split('@')[0]})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>

                {error && (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-400">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                      <AlertCircle className="h-3 w-3" />
                    </div>
                    {error}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-5 sm:p-6 md:p-8 pt-4 border-t border-slate-100 bg-slate-50/50 dark:border-slate-800/50 dark:bg-slate-900/20">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateDialog(false);
                      resetDepartmentForm();
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    form="createDepartmentForm"
                    type="submit"
                    className="flex-[2] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-blue-500/20 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/30 active:translate-y-0"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Plus className="h-4 w-4" />
                      Create Department
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Department Dialog */}
        {showEditDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
              onClick={() => {
                setShowEditDialog(null);
                resetDepartmentForm();
              }}
            />
            <div className="relative z-50 flex flex-col w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden rounded-3xl md:rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl shadow-blue-500/10 dark:border-slate-800 dark:bg-slate-950">
              {/* Header */}
              <div className="p-5 sm:p-6 md:p-8 pb-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    Edit <span className="text-blue-500">Department</span>
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                    Refine organizational parameters and assignments
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowEditDialog(null);
                    resetDepartmentForm();
                  }}
                  className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 dark:bg-slate-900 dark:text-slate-500 dark:hover:bg-red-500/10"
                >
                  <X className="h-6 w-6 transition-transform group-hover:rotate-90" />
                </button>
              </div>

              {/* Form Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 custom-scrollbar">
                <form id="editDepartmentForm" onSubmit={handleUpdateDepartment} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <BuildingIcon className="w-3.5 h-3.5" />
                        Department Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="e.g., Engineering"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Department Code
                      </label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="e.g., ENG, MKT, SALES"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        <Briefcase className="w-3.5 h-3.5" />
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500/50"
                        placeholder="What define's this department's mission?"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[2rem] border border-blue-100 bg-blue-50/30 p-6 dark:border-blue-900/30 dark:bg-blue-900/10">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/20">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                          Division HOD Assignments
                        </h3>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Delegate management authority per division
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {divisions.map((division) => (
                        <div key={division._id} className="space-y-1.5 p-4 rounded-2xl bg-white border border-slate-100 dark:bg-slate-900 dark:border-slate-800/50">
                          <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {division.name}
                          </label>
                          <select
                            value={divisionHODMap[division._id] || ''}
                            onChange={(e) => setDivisionHODMap(prev => ({ ...prev, [division._id]: e.target.value }))}
                            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium transition-all focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="">No Specific HOD</option>
                            {hodUsers.map((user) => (
                              <option key={user._id} value={user._id}>
                                {user.name} ({user.email.split('@')[0]})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </form>

                {error && (
                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-400">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                      <AlertCircle className="h-3 w-3" />
                    </div>
                    {error}
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-5 sm:p-6 md:p-8 pt-4 border-t border-slate-100 bg-slate-50/50 dark:border-slate-800/50 dark:bg-slate-900/20">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDialog(null);
                      resetDepartmentForm();
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-sm font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    form="editDepartmentForm"
                    type="submit"
                    className="flex-[2] rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-blue-500/20 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/30 active:translate-y-0"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Check className="h-4 w-4" />
                      Update Department
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Link Designation Dialog */}
        {showLinkDesignationDialog && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
              onClick={() => setShowLinkDesignationDialog(null)}
            />
            <div className="relative z-[60] w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Link Designation</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Add an existing designation to this department
                  </p>
                </div>
                <button
                  onClick={() => setShowLinkDesignationDialog(null)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {unlinkedDesignations.length === 0 ? (
                  <p className="text-center text-sm text-slate-500 py-4">No unlinked designations available.</p>
                ) : (
                  unlinkedDesignations.map(d => (
                    <div key={d._id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{d.name}</p>
                        {d.code && <p className="text-xs text-slate-500">{d.code}</p>}
                      </div>
                      <button
                        onClick={() => handleLinkDesignation(d._id)}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      >
                        Link
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )
        }

        {/* Existing Shift Dialog */}
        {
          showShiftDialog && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
                onClick={() => {
                  setShowShiftDialog(null);
                  setSelectedShifts([]);
                }}
              />
              <div className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      Assign Shifts to {showShiftDialog.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Select shifts to assign to this department
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowShiftDialog(null);
                      setSelectedShifts([]);
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleAssignShifts} className="space-y-5">
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

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                    >
                      Assign Shifts
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowShiftDialog(null);
                        setSelectedShifts([]);
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Designation Dialog */}
        {
          showDesignationDialog && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
                onClick={() => {
                  setShowDesignationDialog(null);
                  resetDesignationForm();
                  setExistingDesignationSearch('');
                }}
              />
              <div className="relative z-50 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50 px-6 py-4 dark:border-slate-700 dark:from-slate-900 dark:to-blue-900/20">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      {showDesignationDialog === 'global' ? 'Global Designations' : 'Manage Designations'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {showDesignationDialog === 'global' ? 'Create independent designations' : 'Create and manage designations for this department'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowDesignationDialog(null);
                      resetDesignationForm();
                      setExistingDesignationSearch('');
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-700">
                  {/* Left Side - Add New Designation Form */}
                  <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </span>
                        Add New Designation
                      </h3>
                      <form onSubmit={handleCreateDesignation} className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Designation Name *
                          </label>
                          <input
                            type="text"
                            value={designationName}
                            onChange={(e) => setDesignationName(e.target.value)}
                            required
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            placeholder="e.g., Senior Developer"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Designation Code
                          </label>
                          <input
                            type="text"
                            value={designationCode}
                            onChange={(e) => setDesignationCode(e.target.value.toUpperCase())}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            placeholder="e.g., SR-DEV"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Description
                          </label>
                          <textarea
                            value={designationDescription}
                            onChange={(e) => setDesignationDescription(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            placeholder="Designation description..."
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Paid Leaves Count
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={designationPaidLeaves}
                            onChange={(e) => setDesignationPaidLeaves(Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </div>

                        {error && (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                            {error}
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Designation
                          </span>
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Side - Existing Designations List */}
                  <div className="p-6 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/30" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </span>
                      Existing Designations
                      {designations.length > 0 && (
                        <span className="ml-auto rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {designations.length}
                        </span>
                      )}
                    </h3>

                    {/* Search designations */}
                    <div className="relative mb-4">
                      <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search designations by name or code..."
                        value={existingDesignationSearch}
                        onChange={(e) => setExistingDesignationSearch(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                          className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Link Existing Designation
                        </button>
                      </div>
                    )}

                    {/* Manual Linking Form (Inline) */}
                    {showLinkDesignationDialog === showDesignationDialog && (
                      <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10">
                        <h4 className="mb-3 text-sm font-semibold text-indigo-900 dark:text-indigo-300">Link Designation to Department</h4>
                        <div className="space-y-3">
                          <div className="relative">
                            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                              type="text"
                              placeholder="Search designations by name or code..."
                              value={linkDesignationSearch}
                              onChange={(e) => setLinkDesignationSearch(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <select
                              value={selectedLinkDesignationId}
                              onChange={(e) => setSelectedLinkDesignationId(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
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
                              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Link
                            </button>
                            <button
                              onClick={() => {
                                setShowLinkDesignationDialog(null);
                                setSelectedLinkDesignationId('');
                                setLinkDesignationSearch('');
                              }}
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
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
                            className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
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
                              <button
                                onClick={() => handleOpenDesignationShiftDialog(designation)}
                                className="flex-shrink-0 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-2 text-purple-700 transition-all hover:from-purple-100 hover:to-indigo-100 hover:shadow-sm dark:border-purple-800 dark:from-purple-900/20 dark:to-indigo-900/20 dark:text-purple-300"
                                title="Manage Shifts"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Assign Shifts to Designation Dialog */}
        {
          showDesignationShiftDialog && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
                onClick={() => {
                  setShowDesignationShiftDialog(null);
                  setSelectedDesignationShifts([]);
                }}
              />
              <div className="relative z-[60] w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-purple-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      Assign Shifts
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Assign shifts to <span className="font-medium text-purple-600 dark:text-purple-400">{showDesignationShiftDialog.name}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowDesignationShiftDialog(null);
                      setSelectedDesignationShifts([]);
                    }}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleAssignDesignationShifts} className="space-y-5">
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

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2"
                    >
                      Save Shifts
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDesignationShiftDialog(null);
                        setSelectedDesignationShifts([]);
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }

        {/* Shift Breakdown Dialog */}
        {
          showShiftBreakdownDialog && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <div
                className="fixed inset-0 bg-slate-900/75 backdrop-blur-md transition-opacity"
                onClick={() => setShowShiftBreakdownDialog(null)}
              />
              <div className="relative z-[70] w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                      Shift Assignments
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Department-wise shift breakdown for <span className="font-medium text-blue-600 dark:text-blue-400">{showShiftBreakdownDialog.name}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setShowShiftBreakdownDialog(null)}
                    className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

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
                </div>

                {/* Empty State */}
                {(!showShiftBreakdownDialog.shifts || showShiftBreakdownDialog.shifts.length === 0) &&
                  (!showShiftBreakdownDialog.departmentShifts || showShiftBreakdownDialog.departmentShifts.length === 0) && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
                      <p className="text-sm text-slate-500 dark:text-slate-400">No shifts assigned to this designation yet</p>
                    </div>
                  )}
              </div>
            </div>
          )
        }


        {/* Main Content Area */}
        <div className="bg-white rounded-3xl border border-slate-100 p-4 md:p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between mb-8 gap-4">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-1.5 h-6 bg-blue-500 rounded-full" />
              Organizational Units
            </h2>

            {/* Division Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0 max-w-2xl">
              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search divisions or departments by name or code..."
                  value={divisionSearch}
                  onChange={(e) => setDivisionSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 outline-none transition-all hover:bg-slate-100 hover:border-blue-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:focus:border-blue-500/50 shadow-sm"
                />
              </div>
              <div className="flex-1 min-w-[200px] max-w-xs">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                    </svg>
                  </div>
                  <select
                    value={selectedDivisionId}
                    onChange={(e) => setSelectedDivisionId(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 outline-none transition-all hover:bg-slate-100 hover:border-blue-300 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:focus:border-blue-500/50 appearance-none shadow-sm cursor-pointer"
                  >
                    <option value="all">All Divisions (Full View)</option>
                    {divisions
                      .filter((div) => {
                        const search = divisionSearch.toLowerCase();
                        if (!search) return true;
                        const name = (div.name || '').toLowerCase();
                        const code = (div.code || '').toLowerCase();
                        return name.includes(search) || code.includes(search);
                      })
                      .map((div) => (
                        <option key={div._id} value={div._id}>
                          {div.name} ({div.code})
                        </option>
                      ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkUploadDesig(true)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              >
                Bulk Import
              </button>
              <button
                onClick={() => handleOpenDesignationDialog('global')}
                className="px-4 py-2 text-sm font-medium text-slate-100 bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
              >
                + Global Designations
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {loading ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20">
                <Spinner />
                <p className="mt-4 text-sm font-medium text-slate-500">Loading departments...</p>
              </div>
            ) : departments.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                  <BuildingIcon className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">No departments yet</h3>
                <p className="text-slate-500 mt-2">Start by creating your first department.</p>
              </div>
            ) : (() => {
              const filteredDepts = departments.filter((dept) => {
                  // When searching: show departments that match division name/code OR department name/code
                  if (divisionSearch.trim()) {
                    const search = divisionSearch.toLowerCase();
                    // Match by department's own name or code
                    const deptName = (dept.name || '').toLowerCase();
                    const deptCode = (dept.code || '').toLowerCase();
                    if (deptName.includes(search) || deptCode.includes(search)) return true;
                    // Match by linked division's name or code
                    const divIds = dept.divisions || [];
                    const matchesDivision = divIds.some((divId) => {
                      const divIdStr = typeof divId === 'string' ? divId : (divId as any)?._id;
                      if (!divIdStr) return false;
                      const div = divisions.find((d) => String(d._id) === String(divIdStr));
                      if (!div) return false;
                      const name = (div.name || '').toLowerCase();
                      const code = (div.code || '').toLowerCase();
                      return name.includes(search) || code.includes(search);
                    });
                    if (!matchesDivision) return false;
                  }
                  // Division dropdown filter: when specific division selected, only show linked depts
                  if (selectedDivisionId !== 'all') {
                    const isInSelectedDivision = dept.divisions?.some((divId) => {
                      const id = typeof divId === 'string' ? divId : (divId as any)?._id;
                      return id && String(id) === String(selectedDivisionId);
                    });
                    return !!isInSelectedDivision;
                  }
                  return true;
                });
              if (filteredDepts.length === 0) {
                return (
                  <div className="col-span-full py-20 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">No matching units</h3>
                    <p className="text-slate-500 mt-2">Try adjusting your search or division filter.</p>
                  </div>
                );
              }
              return filteredDepts.map((dept) => {
                const isLinked = selectedDivisionId === 'all' || dept.divisions?.some(divId =>
                  (typeof divId === 'string' ? divId : (divId as any)._id) === selectedDivisionId
                );

                return (
                  <div
                    key={dept._id}
                    onClick={() => handleCardClick(dept)}
                    className={`group relative flex flex-col p-4 rounded-2xl bg-white border-3 transition-all duration-300 hover:-translate-y-1
                         ${isLinked
                        ? 'border-slate-100 hover:border-blue-200 hover:shadow-lg'
                        : 'border-slate-100 opacity-60 grayscale-[0.8] hover:opacity-80 hover:scale-[0.98] cursor-pointer'
                      }
                      `}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black shadow-inner border border-blue-100 group-hover:scale-110 transition-transform">
                          {(dept.code || dept.name.substring(0, 2)).substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors truncate">{dept.name}</h3>
                          {dept.code && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{dept.code}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(dept); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><EditIcon /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteDepartment(dept._id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><TrashIcon /></button>
                      </div>
                    </div>

                    {dept.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-4 min-h-[32px]">
                        {dept.description}
                      </p>
                    )}

                    <div className="mt-auto space-y-3">
                      {/* HOD Info */}
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100/50">
                        <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-slate-400 shadow-sm">
                          <UserIcon className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Head of Dept</p>
                          <p className="text-xs font-bold text-slate-700 truncate">
                            {dept.divisionHODs && dept.divisionHODs.length > 0
                              ? `${dept.divisionHODs.length} Div HODs`
                              : (dept.hod?.name || 'Vacant')
                            }
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenDesignationDialog(dept._id); }}
                          className="flex flex-col items-center justify-center p-2 rounded-xl bg-indigo-50/50 border border-indigo-100/50 hover:bg-indigo-50 hover:border-indigo-200 transition-all group/btn"
                        >
                          <span className="text-base font-black text-indigo-600">{dept.designations?.length || 0}</span>
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Roles</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenShiftDialog(dept); }}
                          className="flex flex-col items-center justify-center p-2 rounded-xl bg-amber-50/50 border border-amber-100/50 hover:bg-amber-50 hover:border-amber-200 transition-all group/btn"
                        >
                          <span className="text-base font-black text-amber-600 tracking-tighter">Assign</span>
                          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Shifts</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Bulk Upload Departments Dialog */}
        {
          showBulkUploadDept && (
            <BulkUpload
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
          )
        }

        {/* Bulk Upload Designations Dialog */}
        {
          showBulkUploadDesig && (
            <BulkUpload
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
      </div>
    </div>
  );
}

// End of file
