'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';  // NEW: Import useAuth for role checking

interface Department {
  _id: string;
  name: string;
  code?: string;
}

interface Division {
  _id: string;
  name: string;
  code?: string;
}

interface GlobalRule {
  type: 'fixed' | 'percentage';
  amount?: number | null;
  percentage?: number | null;
  percentageBase?: 'basic' | 'gross' | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  basedOnPresentDays?: boolean;
}

interface DepartmentRule {
  divisionId?: string | { _id: string; name: string; code?: string } | null;  // NEW: Optional division ID
  departmentId: string | { _id: string; name: string; code?: string };
  type: 'fixed' | 'percentage';
  amount?: number | null;
  percentage?: number | null;
  percentageBase?: 'basic' | 'gross' | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  basedOnPresentDays?: boolean;
}

interface AllowanceDeduction {
  _id: string;
  name: string;
  category: 'allowance' | 'deduction';
  description?: string | null;
  isActive: boolean;
  globalRule: GlobalRule;
  departmentRules: DepartmentRule[];
  createdAt?: string;
  updatedAt?: string;
}

export default function AllowancesDeductionsPage() {
  const { user } = useAuth();  // NEW: Get current user for role checking
  const [activeTab, setActiveTab] = useState<'all' | 'allowances' | 'deductions'>('all');
  const [items, setItems] = useState<AllowanceDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);  // NEW: Divisions state

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeptRuleDialog, setShowDeptRuleDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AllowanceDeduction | null>(null);
  const [selectedDeptForRule, setSelectedDeptForRule] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    category: 'allowance' as 'allowance' | 'deduction',
    description: '',
    type: 'fixed' as 'fixed' | 'percentage',
    amount: null as number | null,
    percentage: null as number | null,
    percentageBase: 'basic' as 'basic' | 'gross',
    minAmount: null as number | null,
    maxAmount: null as number | null,
    basedOnPresentDays: false,
    isActive: true,
  });

  // Department rule form
  const [deptRuleForm, setDeptRuleForm] = useState({
    divisionId: '',  // NEW: Optional division selection
    departmentId: '',
    type: 'fixed' as 'fixed' | 'percentage',
    amount: null as number | null,
    percentage: null as number | null,
    percentageBase: 'basic' as 'basic' | 'gross',
    minAmount: null as number | null,
    maxAmount: null as number | null,
    basedOnPresentDays: false,
  });

  useEffect(() => {
    loadItems();
    loadDepartments();
    loadDivisions();  // NEW: Load divisions
  }, [activeTab]);

  const loadItems = async () => {
    try {
      setLoading(true);
      let response;

      if (activeTab === 'allowances') {
        response = await api.getAllowances(true);
      } else if (activeTab === 'deductions') {
        response = await api.getDeductions(true);
      } else {
        response = await api.getAllAllowancesDeductions(undefined, true);
      }

      if (response.success && response.data) {
        setItems(response.data);
      }
    } catch (error) {
      console.error('Error loading items:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to load allowances/deductions',
        timer: 2000,
        showConfirmButton: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  // NEW: Load divisions function
  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions(true);
      if (response.success && response.data) {
        setDivisions(response.data);
      }
    } catch (error) {
      console.error('Error loading divisions:', error);
    }
  };

  const handleCreate = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const handleEdit = (item: AllowanceDeduction) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description || '',
      type: item.globalRule.type,
      amount: item.globalRule.amount ?? null,
      percentage: item.globalRule.percentage ?? null,
      percentageBase: item.globalRule.percentageBase || 'basic',
      minAmount: item.globalRule.minAmount ?? null,
      maxAmount: item.globalRule.maxAmount ?? null,
      basedOnPresentDays: item.globalRule.basedOnPresentDays || false,
      isActive: item.isActive,
    });
    setShowEditDialog(true);
  };

  const handleAddDeptRule = (item: AllowanceDeduction) => {
    setSelectedItem(item);
    setSelectedDeptForRule('');
    resetDeptRuleForm();
    setShowDeptRuleDialog(true);
  };

  const handleEditDeptRule = (item: AllowanceDeduction, deptId: string) => {
    const rule = item.departmentRules.find(
      (r) => (typeof r.departmentId === 'string' ? r.departmentId : r.departmentId._id) === deptId
    );

    if (rule) {
      setSelectedItem(item);
      setSelectedDeptForRule(deptId);
      setDeptRuleForm({
        divisionId: rule.divisionId ? (typeof rule.divisionId === 'string' ? rule.divisionId : rule.divisionId._id) : '',  // NEW: Include divisionId
        departmentId: deptId,
        type: rule.type,
        amount: rule.amount ?? null,
        percentage: rule.percentage ?? null,
        percentageBase: rule.percentageBase || 'basic',
        minAmount: rule.minAmount ?? null,
        maxAmount: rule.maxAmount ?? null,
        basedOnPresentDays: rule.basedOnPresentDays || false,
      });
      setShowDeptRuleDialog(true);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'allowance',
      description: '',
      type: 'fixed',
      amount: null,
      percentage: null,
      percentageBase: 'basic',
      minAmount: null,
      maxAmount: null,
      basedOnPresentDays: false,
      isActive: true,
    });
  };

  const resetDeptRuleForm = () => {
    setDeptRuleForm({
      divisionId: '',  // NEW: Reset divisionId
      departmentId: '',
      type: 'fixed',
      amount: null,
      percentage: null,
      percentageBase: 'basic',
      minAmount: null,
      maxAmount: null,
      basedOnPresentDays: false,
    });
  };

  const handleSave = async () => {
    try {
      // Validation
      if (!formData.name.trim()) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: 'Name is required',
        });
        return;
      }

      if (formData.type === 'fixed' && (formData.amount === null || formData.amount === undefined)) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: 'Amount is required for fixed type',
        });
        return;
      }

      if (formData.type === 'percentage') {
        if (formData.percentage === null || formData.percentage === undefined) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Percentage is required for percentage type',
          });
          return;
        }
        if (!formData.percentageBase) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Percentage base is required for percentage type',
          });
          return;
        }
      }

      if (formData.minAmount !== null && formData.maxAmount !== null) {
        if (formData.minAmount > formData.maxAmount) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Min amount cannot be greater than max amount',
          });
          return;
        }
      }

      const globalRule: GlobalRule = {
        type: formData.type,
        amount: formData.type === 'fixed' ? formData.amount : null,
        percentage: formData.type === 'percentage' ? formData.percentage : null,
        percentageBase: formData.type === 'percentage' ? formData.percentageBase : null,
        minAmount: formData.minAmount,
        maxAmount: formData.maxAmount,
        basedOnPresentDays: formData.type === 'fixed' ? formData.basedOnPresentDays : false,
      };

      // Convert GlobalRule to API format (null -> undefined for amount/percentage)
      const apiGlobalRule = {
        type: globalRule.type,
        amount: globalRule.amount ?? undefined,
        percentage: globalRule.percentage ?? undefined,
        percentageBase: globalRule.percentageBase ?? undefined,
        minAmount: globalRule.minAmount ?? undefined,
        maxAmount: globalRule.maxAmount ?? undefined,
        basedOnPresentDays: globalRule.basedOnPresentDays,
      };

      if (selectedItem) {
        // Update
        const response = await api.updateAllowanceDeduction(selectedItem._id, {
          name: formData.name,
          description: formData.description || undefined,
          globalRule: apiGlobalRule,
          isActive: formData.isActive,
        });

        if (response.success) {
          Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Updated successfully!',
            timer: 2000,
            showConfirmButton: false,
          });
          setShowEditDialog(false);
          loadItems();
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Failed',
            text: response.message || 'Failed to update',
          });
        }
      } else {
        // Create
        const response = await api.createAllowanceDeduction({
          name: formData.name,
          category: formData.category,
          description: formData.description || undefined,
          globalRule: apiGlobalRule,
          isActive: formData.isActive,
        });

        if (response.success) {
          Swal.fire({
            icon: 'success',
            title: 'Success!',
            text: 'Created successfully!',
            timer: 2000,
            showConfirmButton: false,
          });
          setShowCreateDialog(false);
          resetForm();
          loadItems();
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Failed',
            text: response.message || 'Failed to create',
          });
        }
      }
    } catch (error: any) {
      console.error('Error saving:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to save',
      });
    }
  };

  const handleSaveDeptRule = async () => {
    if (!selectedItem) return;

    try {
      // Validation
      if (!deptRuleForm.departmentId) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: 'Please select a department',
        });
        return;
      }

      if (deptRuleForm.type === 'fixed' && (deptRuleForm.amount === null || deptRuleForm.amount === undefined)) {
        Swal.fire({
          icon: 'warning',
          title: 'Validation Error',
          text: 'Amount is required for fixed type',
        });
        return;
      }

      if (deptRuleForm.type === 'percentage') {
        if (deptRuleForm.percentage === null || deptRuleForm.percentage === undefined) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Percentage is required for percentage type',
          });
          return;
        }
        if (!deptRuleForm.percentageBase) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Percentage base is required for percentage type',
          });
          return;
        }
      }

      if (deptRuleForm.minAmount !== null && deptRuleForm.maxAmount !== null) {
        if (deptRuleForm.minAmount > deptRuleForm.maxAmount) {
          Swal.fire({
            icon: 'warning',
            title: 'Validation Error',
            text: 'Min amount cannot be greater than max amount',
          });
          return;
        }
      }

      const response = await api.addOrUpdateDepartmentRule(selectedItem._id, {
        divisionId: deptRuleForm.divisionId || undefined,  // NEW: Include optional divisionId
        departmentId: deptRuleForm.departmentId,
        type: deptRuleForm.type,
        amount: deptRuleForm.type === 'fixed' ? (deptRuleForm.amount ?? undefined) : undefined,
        percentage: deptRuleForm.type === 'percentage' ? (deptRuleForm.percentage ?? undefined) : undefined,
        percentageBase: deptRuleForm.type === 'percentage' ? (deptRuleForm.percentageBase ?? undefined) : undefined,
        minAmount: deptRuleForm.minAmount ?? undefined,
        maxAmount: deptRuleForm.maxAmount ?? undefined,
        basedOnPresentDays: deptRuleForm.type === 'fixed' ? deptRuleForm.basedOnPresentDays : false,
      });

      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: 'Department rule saved successfully!',
          timer: 2000,
          showConfirmButton: false,
        });
        setShowDeptRuleDialog(false);
        resetDeptRuleForm();
        loadItems();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.message || 'Failed to save department rule',
        });
      }
    } catch (error: any) {
      console.error('Error saving department rule:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to save department rule',
      });
    }
  };

  const handleDeleteDeptRule = async (itemId: string, deptId: string, divisionId?: string | null) => {
    const result = await Swal.fire({
      icon: 'question',
      title: 'Remove Department Rule?',
      text: divisionId
        ? 'Are you sure you want to remove this division-department specific rule?'
        : 'Are you sure you want to remove this department-wide rule?',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Yes, remove it',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      const response = await api.removeDepartmentRule(itemId, deptId, divisionId || undefined);
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: 'Department rule removed successfully!',
          timer: 2000,
          showConfirmButton: false,
        });
        loadItems();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.message || 'Failed to remove department rule',
        });
      }
    } catch (error: any) {
      console.error('Error removing department rule:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to remove department rule',
      });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Delete Item?',
      text: 'Are you sure you want to delete this item? This action cannot be undone.',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    try {
      const response = await api.deleteAllowanceDeduction(id);
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: 'Deleted successfully!',
          timer: 2000,
          showConfirmButton: false,
        });
        loadItems();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: response.message || 'Failed to delete',
        });
      }
    } catch (error: any) {
      console.error('Error deleting:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to delete',
      });
    }
  };

  const getDepartmentName = (deptId: string | { _id: string; name: string; code?: string }) => {
    if (typeof deptId === 'string') {
      const dept = departments.find((d) => d._id === deptId);
      return dept ? dept.name : 'Unknown';
    }
    return deptId.name;
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'allowances') return item.category === 'allowance';
    if (activeTab === 'deductions') return item.category === 'deduction';
    return true;
  });

  return (
    <div className="relative min-h-screen">
      {/* Background Pattern */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-slate-50/40 via-emerald-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-slate-200/60 bg-white/80 p-6 shadow-[0_20px_50px_rgba(148,163,184,0.1)] backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/80 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 shadow-lg shadow-emerald-500/20">
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Allowances & <span className="text-emerald-600 dark:text-emerald-400">Deductions</span>
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                Manage salary components with global rules and department overrides
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Premium Tabs */}
            <div className="flex gap-1 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-slate-900/80">
              {[
                { id: 'all', label: 'All' },
                { id: 'allowances', label: 'Allowances' },
                { id: 'deductions', label: 'Deductions' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative rounded-xl px-5 py-2.5 text-sm font-bold transition-all duration-300 ${activeTab === tab.id
                    ? 'bg-white text-emerald-600 shadow-md ring-1 ring-slate-200/50 dark:bg-slate-800 dark:text-emerald-400 dark:ring-slate-700'
                    : 'text-slate-500 hover:bg-white/50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleCreate}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-emerald-500/30 transition-all hover:bg-emerald-700 hover:shadow-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
              <svg className="h-5 w-5 transition-transform group-hover:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span>Create Component</span>
            </button>
          </div>
        </div>

        {/* Items Grid (Card-based) */}
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/95 py-12 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <Spinner />
            <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">Loading items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-green-100 dark:from-green-900/30 dark:to-green-900/30">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No items found</p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Get started by creating a new {activeTab === 'all' ? 'allowance or deduction' : activeTab}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <div
                key={item._id}
                onClick={() => handleEdit(item)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-lg shadow-slate-200/40 transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-200/50 dark:border-slate-800 dark:bg-slate-950/95 dark:shadow-none dark:hover:border-blue-500/50"
              >
                {/* Gradient accent */}
                <div className={`absolute top-0 left-0 h-1 w-full ${item.category === 'allowance'
                  ? 'bg-gradient-to-r from-green-500 via-green-500 to-green-500'
                  : 'bg-gradient-to-r from-red-500 via-red-500 to-red-500'
                  }`}></div>

                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                    )}
                  </div>
                  <div className="ml-2 flex flex-col gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.category === 'allowance'
                        ? 'bg-green-100 text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 shadow-sm dark:bg-red-900/30 dark:text-red-400'
                        }`}
                    >
                      {item.category === 'allowance' ? 'Allowance' : 'Deduction'}
                    </span>
                    {!item.isActive && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Global Rule */}
                <div className="mb-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 p-3 dark:border-slate-700 dark:from-slate-900/50 dark:to-slate-800/50">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Global Rule
                  </p>
                  <div className="space-y-1">
                    {item.globalRule.type === 'fixed' ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          ₹{item.globalRule.amount?.toLocaleString() || 0}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">(Fixed)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {item.globalRule.percentage}%
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          of {item.globalRule.percentageBase === 'basic' ? 'Basic' : 'Gross'}
                        </span>
                      </div>
                    )}
                    {(item.globalRule.minAmount !== null || item.globalRule.maxAmount !== null) && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                          Min: {item.globalRule.minAmount?.toLocaleString() ?? 'N/A'}
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-50 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                          Max: {item.globalRule.maxAmount?.toLocaleString() ?? 'N/A'}
                        </span>
                      </div>
                    )}
                    {item.globalRule.type === 'fixed' && item.globalRule.basedOnPresentDays && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[9px] font-medium text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                          Prorated based on presence
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Department Rules */}
                {item.departmentRules && item.departmentRules.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Department Overrides ({item.departmentRules.length})
                    </p>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {item.departmentRules.slice(0, 2).map((rule, idx) => {
                        const deptId = typeof rule.departmentId === 'string' ? rule.departmentId : rule.departmentId._id;
                        const divId = rule.divisionId ? (typeof rule.divisionId === 'string' ? rule.divisionId : rule.divisionId._id) : null;
                        const divName = rule.divisionId && typeof rule.divisionId === 'object' ? rule.divisionId.name : null;
                        // Check if user has permission to edit/delete (SuperAdmin, SubAdmin, HR)
                        const canManageOverrides = user && ['super_admin', 'sub_admin', 'hr'].includes(user.role);

                        return (
                          <div
                            key={idx}
                            className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-green-50 p-2 dark:border-green-800 dark:from-green-900/20 dark:to-green-900/20"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <p className="text-[10px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {getDepartmentName(rule.departmentId)}
                                  </p>
                                  {divId ? (
                                    <span className="inline-flex items-center rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                      {divName || 'Division'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      All Divisions
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-400">
                                  {rule.type === 'fixed' ? (
                                    <>₹{rule.amount?.toLocaleString() || 0} (Fixed)</>
                                  ) : (
                                    <>{rule.percentage}% of {rule.percentageBase === 'basic' ? 'Basic' : 'Gross'}</>
                                  )}
                                </p>
                                {rule.type === 'fixed' && rule.basedOnPresentDays && (
                                  <p className="mt-0.5 text-[9px] font-medium text-orange-600 dark:text-orange-400">
                                    Prorated based on presence
                                  </p>
                                )}
                              </div>
                              {/* Action buttons - only for authorized roles */}
                              {canManageOverrides && (
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditDeptRule(item, deptId);
                                    }}
                                    className="rounded-md border border-blue-200 bg-white px-3 py-0.5 text-[9px] font-bold text-blue-600 transition-all hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
                                    title="Edit this override"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteDeptRule(item._id, deptId, divId);
                                    }}
                                    className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-[9px] font-bold text-red-600 transition-all hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800"
                                    title="Delete this override"
                                  >
                                    Del
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {item.departmentRules.length > 2 && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                          +{item.departmentRules.length - 2} more override{item.departmentRules.length - 2 > 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(item);
                    }}
                    className="group flex-1 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 transition-all hover:bg-blue-50 hover:shadow-md dark:border-blue-800 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddDeptRule(item);
                    }}
                    className="group flex-1 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 transition-all hover:bg-blue-50 hover:shadow-md dark:border-blue-800 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-800"
                  >
                    Override
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item._id);
                    }}
                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-all hover:bg-red-50 hover:shadow-md dark:border-red-800 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {(showCreateDialog || showEditDialog) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setShowCreateDialog(false);
              setShowEditDialog(false);
              setSelectedItem(null);
              resetForm();
            }}
          />
          <div className="relative z-50 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-2xl shadow-green-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedItem ? 'Edit' : 'Create'} {formData.category === 'allowance' ? 'Allowance' : 'Deduction'}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {selectedItem ? 'Update the allowance/deduction details' : 'Add a new allowance or deduction to your payroll system'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setShowEditDialog(false);
                  setSelectedItem(null);
                  resetForm();
                }}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="e.g., House Rent Allowance, PF Contribution"
                />
              </div>

              {/* Category (only for create) */}
              {!selectedItem && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'allowance' | 'deduction' })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="allowance">Allowance</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  placeholder="Optional description"
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Calculation Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'fixed' | 'percentage';
                    setFormData({
                      ...formData,
                      type: newType,
                      amount: newType === 'fixed' ? formData.amount : null,
                      percentage: newType === 'percentage' ? formData.percentage : null,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>

              {/* Fixed Amount */}
              {formData.type === 'fixed' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount ?? ''}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., 2000"
                  />
                </div>
              )}

              {/* Based on Present Days (only for fixed) */}
              {formData.type === 'fixed' && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.basedOnPresentDays}
                      onChange={(e) => setFormData({ ...formData, basedOnPresentDays: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Prorate based on present days</span>
                  </label>
                </div>
              )}

              {/* Percentage Fields */}
              {formData.type === 'percentage' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Percentage (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.percentage ?? ''}
                      onChange={(e) => setFormData({ ...formData, percentage: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="e.g., 12, 40"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Percentage Base <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.percentageBase}
                      onChange={(e) => setFormData({ ...formData, percentageBase: e.target.value as 'basic' | 'gross' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="basic">Basic Salary</option>
                      <option value="gross">Gross Salary</option>
                    </select>
                  </div>
                </>
              )}

              {/* Min/Max Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Min Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, minAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Max Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.maxAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Optional"
                  />
                </div>
              </div>

              {/* Is Active */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Active</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setShowCreateDialog(false);
                  setShowEditDialog(false);
                  setSelectedItem(null);
                  resetForm();
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                {selectedItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Rule Dialog */}
      {showDeptRuleDialog && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setShowDeptRuleDialog(false);
              setSelectedItem(null);
              resetDeptRuleForm();
            }}
          />
          <div className="relative z-50 w-full max-w-lg rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-2xl shadow-green-500/10 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedDeptForRule ? 'Edit' : 'Add'} Department Override
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Override global rule for <span className="font-medium text-green-600 dark:text-green-400">{selectedItem.name}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowDeptRuleDialog(false);
                  setSelectedItem(null);
                  resetDeptRuleForm();
                }}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Division (Optional) */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Division <span className="text-slate-400">(Optional)</span>
                </label>
                <select
                  value={deptRuleForm.divisionId}
                  onChange={(e) => setDeptRuleForm({ ...deptRuleForm, divisionId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">All Divisions (Department-wide)</option>
                  {divisions
                    .filter((div) => div._id)
                    .map((div) => (
                      <option key={div._id} value={div._id}>
                        {div.name} {div.code ? `(${div.code})` : ''}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Leave empty to apply this rule to all divisions in the selected department
                </p>
              </div>

              {/* Department Selection */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={deptRuleForm.departmentId}
                  onChange={(e) => setDeptRuleForm({ ...deptRuleForm, departmentId: e.target.value })}
                  disabled={!!selectedDeptForRule}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-600"
                >
                  <option value="">-- Select Department --</option>
                  {departments
                    .filter((dept) => {
                      if (selectedDeptForRule) return dept._id === selectedDeptForRule;
                      // Filter out departments that already have rules
                      return !selectedItem.departmentRules.some(
                        (r) => (typeof r.departmentId === 'string' ? r.departmentId : r.departmentId._id) === dept._id
                      );
                    })
                    .map((dept) => (
                      <option key={dept._id} value={dept._id}>
                        {dept.name} {dept.code ? `(${dept.code})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Calculation Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={deptRuleForm.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'fixed' | 'percentage';
                    setDeptRuleForm({
                      ...deptRuleForm,
                      type: newType,
                      amount: newType === 'fixed' ? deptRuleForm.amount : null,
                      percentage: newType === 'percentage' ? deptRuleForm.percentage : null,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>

              {/* Fixed Amount */}
              {deptRuleForm.type === 'fixed' && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.amount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, amount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="e.g., 5000"
                  />
                </div>
              )}

              {/* Based on Present Days (only for fixed) */}
              {deptRuleForm.type === 'fixed' && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deptRuleForm.basedOnPresentDays}
                      onChange={(e) => setDeptRuleForm({ ...deptRuleForm, basedOnPresentDays: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Prorate based on present days</span>
                  </label>
                </div>
              )}

              {/* Percentage Fields */}
              {deptRuleForm.type === 'percentage' && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Percentage (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={deptRuleForm.percentage ?? ''}
                      onChange={(e) => setDeptRuleForm({ ...deptRuleForm, percentage: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="e.g., 30"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Percentage Base <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={deptRuleForm.percentageBase}
                      onChange={(e) => setDeptRuleForm({ ...deptRuleForm, percentageBase: e.target.value as 'basic' | 'gross' })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="basic">Basic Salary</option>
                      <option value="gross">Gross Salary</option>
                    </select>
                  </div>
                </>
              )}

              {/* Min/Max Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Min Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.minAmount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, minAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Max Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.maxAmount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, maxAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setShowDeptRuleDialog(false);
                  setSelectedItem(null);
                  resetDeptRuleForm();
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDeptRule}
                className="flex-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
              >
                {selectedDeptForRule ? 'Update' : 'Add'} Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

