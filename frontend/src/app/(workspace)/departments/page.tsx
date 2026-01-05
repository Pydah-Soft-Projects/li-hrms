'use client';

import { useState, useEffect } from 'react';
import { api, Department, Shift, Designation } from '@/lib/api';
import BulkUpload from '@/components/BulkUpload';
import {
  DEPARTMENT_TEMPLATE_HEADERS,
  DEPARTMENT_TEMPLATE_SAMPLE,
  DESIGNATION_TEMPLATE_HEADERS,
  DESIGNATION_TEMPLATE_SAMPLE,
  validateDepartmentRow,
  validateDesignationRow,
  ParsedRow,
} from '@/lib/bulkUpload';
import Spinner from '@/components/Spinner';

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<Department | null>(null);
  const [showDesignationDialog, setShowDesignationDialog] = useState<string | null>(null);
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
  const [hodId, setHodId] = useState('');

  // Shift assignment state
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [selectedDesignationShiftIds, setSelectedDesignationShiftIds] = useState<string[]>([]);

  // Designation form state
  const [designationName, setDesignationName] = useState('');
  const [designationCode, setDesignationCode] = useState('');
  const [designationDescription, setDesignationDescription] = useState('');
  const [designationPaidLeaves, setDesignationPaidLeaves] = useState(0);

  // Manual Linking State
  const [showLinkDesignationDialog, setShowLinkDesignationDialog] = useState(false);
  const [unlinkedDesignations, setUnlinkedDesignations] = useState<any[]>([]);
  const [selectedLinkDesignationId, setSelectedLinkDesignationId] = useState<string>('');

  useEffect(() => {
    loadDepartments();
    loadUsers();
    // Load shifts on page load so they're available when dialog opens
    loadShifts();
  }, []);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const response = await api.getDepartments();
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
    try {
      const response = await api.getDesignations(departmentId);
      if (response.success && response.data) {
        setDesignations(response.data);
      }
    } catch (err) {
      console.error('Error loading designations:', err);
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
        hod: hodId || undefined,
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
        hod: hodId || undefined,
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
      const response = await api.assignShifts(showShiftDialog._id, selectedShiftIds);

      if (response.success) {
        setShowShiftDialog(null);
        setSelectedShiftIds([]);
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

      // Check if this is global designation creation or department-specific
      const isGlobal = showDesignationDialog === 'global';

      const response = isGlobal
        ? await api.createGlobalDesignation(data)
        : await api.createDesignation(showDesignationDialog, data);

      if (response.success) {
        setShowDesignationDialog(null);
        resetDesignationForm();
        // Reload designations if it was department-specific
        if (!isGlobal && showDesignationDialog) {
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

  const handleOpenLinkDesignationDialog = async () => {
    try {
      setLoadingShifts(true);
      const globalRes = await api.getAllDesignations();
      if (globalRes && globalRes.success) {
        const allDesignations = globalRes.data || [];
        // Filter out designations that are already linked
        const linkedIds = designations.map(d => d._id);
        const available = allDesignations.filter((d: any) => !linkedIds.includes(d._id));
        setUnlinkedDesignations(available);
      }
      setShowLinkDesignationDialog(true);
    } catch (err) {
      console.error(err);
      setError('Failed to load available designations');
    } finally {
      setLoadingShifts(false);
    }
  };

  const handleLinkDesignation = async () => {
    if (!selectedLinkDesignationId || !showDesignationDialog) return;

    try {
      // showDesignationDialog holds the department ID when in department mode
      const response = await api.linkDesignationToDepartment(showDesignationDialog, selectedLinkDesignationId);

      if (response.success) {
        setShowLinkDesignationDialog(false);
        setSelectedLinkDesignationId('');
        loadDesignations(showDesignationDialog); // Refresh list
      } else {
        setError(response.message || 'Failed to link designation');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred while linking');
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
    setHodId('');
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
    setHodId(dept.hod?._id || '');
    setError('');
  };

  const handleOpenShiftDialog = (dept: Department) => {
    setShowShiftDialog(dept);
    // Reload shifts to ensure we have the latest data
    loadShifts();
    // Set currently assigned shifts
    const assignedShiftIds = dept.shifts?.map((s: any) => (typeof s === 'string' ? s : s._id)) || [];
    setSelectedShiftIds(assignedShiftIds);
    setError('');
  };

  const toggleShiftSelection = (shiftId: string) => {
    setSelectedShiftIds((prev) =>
      prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId]
    );
  };

  const toggleDesignationShiftSelection = (shiftId: string) => {
    setSelectedDesignationShiftIds((prev) =>
      prev.includes(shiftId) ? prev.filter((id) => id !== shiftId) : [...prev, shiftId]
    );
  };

  const handleOpenDesignationShiftDialog = (designation: Designation) => {
    setShowDesignationShiftDialog(designation);
    loadShifts();
    const assignedShiftIds = designation.shifts?.map((s: any) => (typeof s === 'string' ? s : s._id)) || [];
    setSelectedDesignationShiftIds(assignedShiftIds);
    setError('');
  };

  const handleAssignDesignationShifts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDesignationShiftDialog) return;
    setError('');

    try {
      // Pass the current department ID to save shifts specifically for this department
      const response = await api.assignShiftsToDesignation(
        showDesignationShiftDialog._id,
        selectedDesignationShiftIds,
        showDesignationDialog || undefined
      );

      if (response.success) {
        setShowDesignationShiftDialog(null);
        setSelectedDesignationShiftIds([]);

        // Update local state directly with the returned populated designation
        if (response.data) {
          setDesignations(prev => prev.map(d => d._id === response.data._id ? response.data : d));
        } else if (showDesignationDialog) {
          // Fallback to reload if no data returned
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
        {/* Header Section */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-5 shadow-[0_8px_26px_rgba(30,64,175,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90 sm:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl">
              Department Management
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Organize and manage your departments with ease
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowBulkUploadDept(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 transition-all hover:bg-blue-50 hover:shadow-md dark:border-blue-800 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Depts
            </button>
            <button
              onClick={() => setShowBulkUploadDesig(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-700 transition-all hover:bg-indigo-50 hover:shadow-md dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Designations
            </button>
            <button
              onClick={() => {
                resetDesignationForm();
                setShowDesignationDialog('global');
                loadDesignations('global');
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-50 hover:shadow-md dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              <span className="text-lg">+</span>
              Create Designation
            </button>
            <button
              onClick={() => {
                resetDepartmentForm();
                setShowCreateDialog(true);
              }}
              className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
            >
              <span className="text-lg">+</span>
              <span>Create Department</span>
            </button>
          </div>
        </div>

        {/* Create Department Dialog */}
        {showCreateDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowCreateDialog(false);
                resetDepartmentForm();
              }}
            />
            <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Create New Department
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Add a new department to your organization
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                    resetDepartmentForm();
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleCreateDepartment} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., Information Technology"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., IT, HR, FIN"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Department description..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Head of Department (HOD)
                  </label>
                  <select
                    value={hodId}
                    onChange={(e) => setHodId(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select HOD (Optional)</option>
                    {hodUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

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
                    Create Department
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateDialog(false);
                      resetDepartmentForm();
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Department Dialog */}
        {showEditDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowEditDialog(null);
                resetDepartmentForm();
              }}
            />
            <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Edit Department</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Update department information
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowEditDialog(null);
                    resetDepartmentForm();
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleUpdateDepartment} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., Information Technology"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Department Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., IT, HR, FIN"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Department description..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Head of Department (HOD)
                  </label>
                  <select
                    value={hodId}
                    onChange={(e) => setHodId(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select HOD (Optional)</option>
                    {hodUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

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
                    Update Department
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDialog(null);
                      resetDepartmentForm();
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Shifts Dialog */}
        {showShiftDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowShiftDialog(null);
                setSelectedShiftIds([]);
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
                    setSelectedShiftIds([]);
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAssignShifts} className="space-y-5">
                <div>
                  <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select Shifts (Multiple selection allowed)
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
                          className={`group flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-all ${selectedShiftIds.includes(shift._id)
                            ? 'border-blue-300 bg-blue-50/50 shadow-md shadow-blue-100 dark:border-blue-700 dark:bg-blue-900/20'
                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedShiftIds.includes(shift._id)}
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
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {selectedShiftIds.length > 0 && (
                  <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      <span className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                        {selectedShiftIds.length}
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
                      setSelectedShiftIds([]);
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Designation Dialog */}
        {showDesignationDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowDesignationDialog(null);
                resetDesignationForm();
              }}
            />
            <div className="relative z-50 w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl shadow-blue-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/50 px-6 py-4 dark:border-slate-700 dark:from-slate-900 dark:to-blue-900/20">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {showDesignationDialog === 'global' ? 'Create Global Designation' : 'Manage Designations'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {showDesignationDialog === 'global'
                      ? 'Create a designation that can be used across all departments'
                      : 'View and configure designations linked to this department'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDesignationDialog(null);
                    resetDesignationForm();
                  }}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Conditional Layout based on dialog type */}
              {showDesignationDialog === 'global' ? (
                /* Global Designation Creation - Single Column Form */
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                  <div className="max-w-2xl mx-auto">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 p-5 dark:border-slate-700 dark:from-slate-900/50 dark:to-blue-900/10">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </span>
                        Create Global Designation
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
                            Create Designation
                          </span>
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ) : (
                /* Department Designations - Full Width List Only */
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </span>
                    Linked Designations
                    {designations.length > 0 && (
                      <span className="ml-auto rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                        {designations.length}
                      </span>
                    )}
                  </h3>

                  {/* Link Button */}
                  <button
                    onClick={handleOpenLinkDesignationDialog}
                    className="mb-4 w-full rounded-xl border border-dashed border-indigo-300 bg-indigo-50 py-3 text-sm font-medium text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-400 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
                  >
                    + Link Existing Designation
                  </button>

                  {/* Manual Linking Form (Inline) */}
                  {showLinkDesignationDialog && (
                    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-900/10">
                      <h4 className="mb-3 text-sm font-semibold text-indigo-900 dark:text-indigo-300">Link Designation to Department</h4>
                      <div className="space-y-3">
                        <div>
                          <select
                            value={selectedLinkDesignationId}
                            onChange={(e) => setSelectedLinkDesignationId(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            <option value="">Select a designation...</option>
                            {unlinkedDesignations.length === 0 ? (
                              <option disabled>No unlinked designations available</option>
                            ) : (
                              unlinkedDesignations.map((d) => (
                                <option key={d._id} value={d._id}>
                                  {d.name} {d.code ? `(${d.code})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleLinkDesignation}
                            disabled={!selectedLinkDesignationId}
                            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Link
                          </button>
                          <button
                            onClick={() => {
                              setShowLinkDesignationDialog(false);
                              setSelectedLinkDesignationId('');
                            }}
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {designations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No designations linked yet</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Designations will be automatically linked when employees are assigned</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {designations.map((designation) => (
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
                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 w-full">Global:</span>
                                    {designation.shifts.map((shift: any) => (
                                      <button
                                        key={shift._id}
                                        onClick={() => setShowShiftBreakdownDialog(designation)}
                                        className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10 hover:bg-purple-100 transition-colors dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/20 dark:hover:bg-purple-400/20 cursor-pointer"
                                      >
                                        {shift.name}
                                        <span className="text-purple-400 dark:text-purple-500">
                                          ({shift.startTime}-{shift.endTime})
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* Department-Specific Shifts */}
                                {designation.departmentShifts && designation.departmentShifts.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 w-full">Dept-Specific:</span>
                                    {designation.departmentShifts.flatMap((ds) => {
                                      const deptName = typeof ds.department === 'string' ? 'Unknown' : ds.department.name;
                                      const deptId = typeof ds.department === 'string' ? ds.department : ds.department._id;
                                      return ds.shifts?.map((shift: any) => (
                                        <button
                                          key={`${deptId}-${shift._id}`}
                                          onClick={() => setShowShiftBreakdownDialog(designation)}
                                          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-700/10 hover:bg-emerald-100 transition-colors dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20 dark:hover:bg-emerald-400/20 cursor-pointer"
                                          title={deptName}
                                        >
                                          {shift.name} ({deptName})
                                        </button>
                                      )) || [];
                                    })}
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
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assign Shifts to Designation Dialog */}
        {showDesignationShiftDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => {
                setShowDesignationShiftDialog(null);
                setSelectedDesignationShiftIds([]);
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
                    setSelectedDesignationShiftIds([]);
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
                          className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${selectedDesignationShiftIds.includes(shift._id)
                            ? 'border-purple-300 bg-purple-50/50 shadow-sm dark:border-purple-700 dark:bg-purple-900/20'
                            : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-purple-50/30 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDesignationShiftIds.includes(shift._id)}
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
                        </label>
                      ))}
                    </div>
                  )}
                </div>



                {selectedDesignationShiftIds.length > 0 && (
                  <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-3 dark:border-purple-800 dark:from-purple-900/20 dark:to-indigo-900/20">
                    <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                      <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                        {selectedDesignationShiftIds.length}
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
                      setSelectedDesignationShiftIds([]);
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div >
        )
        }

        {/* Shift Breakdown Dialog */}
        {showShiftBreakdownDialog && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
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
                      {showShiftBreakdownDialog.shifts.map((shift: any) => (
                        <div key={shift._id} className="flex items-center justify-between rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-700 dark:bg-slate-900">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{shift.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {shift.startTime} - {shift.endTime} ({shift.duration}h)
                            </p>
                          </div>
                        </div>
                      ))}
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
                      <div key={typeof ds.department === 'string' ? ds.department : ds.department._id} className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                        <h4 className="mb-3 font-medium text-emerald-900 dark:text-emerald-300">
                          {typeof ds.department === 'string' ? 'Unknown Department' : ds.department.name} {typeof ds.department === 'string' || !ds.department.code ? '' : `(${ds.department.code})`}
                        </h4>
                        <div className="space-y-2">
                          {ds.shifts && ds.shifts.length > 0 ? (
                            ds.shifts.map((shift: any) => (
                              <div key={shift._id} className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-700 dark:bg-slate-900">
                                <div>
                                  <p className="font-medium text-slate-900 dark:text-slate-100">{shift.name}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {shift.startTime} - {shift.endTime} ({shift.duration}h)
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500 italic">No shifts assigned</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {(!showShiftBreakdownDialog.shifts || showShiftBreakdownDialog.shifts.length === 0) &&
                  (!showShiftBreakdownDialog.departmentShifts || showShiftBreakdownDialog.departmentShifts.length === 0) && (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/30">
                      <p className="text-sm text-slate-500 dark:text-slate-400">No shifts assigned to this designation yet</p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}


        {/* Departments Grid (Card-based) */}
        {
          loading ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
              <Spinner />
              <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading departments...</p>
            </div>
          ) : departments.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white/95 p-12 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
                <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No departments found</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Create your first department to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {departments.map((dept) => (
                <div
                  key={dept._id}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg shadow-blue-100/40 transition-all hover:border-blue-300 hover:shadow-xl hover:shadow-blue-200/50 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-none dark:hover:border-slate-700"
                >
                  {/* Gradient accent */}
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{dept.name}</h3>
                      {dept.code && (
                        <p className="mt-1 text-sm font-medium text-blue-600 dark:text-blue-400">Code: {dept.code}</p>
                      )}
                    </div>
                    <span
                      className={`ml-3 rounded-full px-3 py-1 text-xs font-semibold ${dept.isActive
                        ? 'bg-green-100 text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                    >
                      {dept.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {dept.description && (
                    <p className="mb-4 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{dept.description}</p>
                  )}

                  <div className="mb-4 space-y-2">
                    {dept.hod && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">HOD:</span>
                        <span className="text-slate-600 dark:text-slate-400">{dept.hod.name || dept.hod.email}</span>
                      </div>
                    )}
                  </div>

                  {dept.shifts && dept.shifts.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Assigned Shifts
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {dept.shifts.map((shift: any) => (
                          <span
                            key={typeof shift === 'string' ? shift : shift._id}
                            className="rounded-lg bg-gradient-to-r from-purple-100 to-indigo-100 px-2.5 py-1 text-xs font-medium text-purple-700 shadow-sm dark:from-purple-900/30 dark:to-indigo-900/30 dark:text-purple-300"
                          >
                            {typeof shift === 'string' ? 'Shift' : shift.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button
                      onClick={() => handleOpenEditDialog(dept)}
                      className="group flex-1 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-all hover:from-blue-100 hover:to-indigo-100 hover:shadow-md dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20 dark:text-blue-300 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleOpenShiftDialog(dept)}
                      className="group flex-1 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-red-50 px-4 py-2.5 text-sm font-semibold text-purple-700 transition-all hover:from-purple-100 hover:to-red-100 hover:shadow-md dark:border-purple-800 dark:from-purple-900/20 dark:to-red-900/20 dark:text-purple-300 dark:hover:from-purple-900/30 dark:hover:to-red-900/30"
                    >
                      Shifts
                    </button>
                    <button
                      onClick={() => handleOpenDesignationDialog(dept._id)}
                      className="group flex-1 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition-all hover:from-indigo-100 hover:to-blue-100 hover:shadow-md dark:border-indigo-800 dark:from-indigo-900/20 dark:to-blue-900/20 dark:text-indigo-300 dark:hover:from-indigo-900/30 dark:hover:to-blue-900/30"
                    >
                      Designations
                    </button>
                    <button
                      onClick={() => handleDeleteDepartment(dept._id)}
                      className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-all hover:from-red-100 hover:to-red-100 hover:shadow-md dark:border-red-800 dark:from-red-900/20 dark:to-red-900/20 dark:text-red-300 dark:hover:from-red-900/30 dark:hover:to-red-900/30"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        }

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
                return { isValid: result.isValid, errors: result.errors };
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
                return { isValid: result.isValid, errors: result.errors };
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
          )
        }
      </div >
    </div >
  );
}
