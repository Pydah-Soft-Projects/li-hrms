'use client';

import { useState, useEffect } from 'react';
import {
  LayoutGrid,
  LayoutList,
  Wallet,
  Layers,
  ArrowUp,
  ArrowDown,
  Plus,
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { canManagePayRegister } from '@/lib/permissions'; // Reuse Pay Register permission for this payroll setting

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
  divisionId?: string | { _id: string; name: string; code?: string } | null;
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
  const { user } = useAuth();
  const hasManagePermission = user ? canManagePayRegister(user as any) : false; // Check write access
  const [activeTab, setActiveTab] = useState<'all' | 'allowances' | 'deductions'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list'); // Default to list
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

  // Responsive View Mode
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('card');
      } else {
        setViewMode('list');
      }
    };

    // Set initial
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-10">
      {/* Sticky Header */}
      <div className="sticky top-0 sm:top-4 z-40 px-0 sm:px-4 mb-4 sm:mb-8">
        <div className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-none sm:rounded-[2.5rem] border-b sm:border border-slate-200/60 dark:border-slate-800 shadow-lg sm:shadow-2xl shadow-slate-200/50 dark:shadow-none min-h-[4.5rem] flex flex-row items-center justify-between gap-2 px-4 sm:px-8 py-3 sm:py-2">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 uppercase tracking-tight">
                Allowances & Deductions
              </h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                Payroll <span className="h-1 w-1 rounded-full bg-slate-300"></span> Configuration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-x-auto hide-scrollbar">


            {hasManagePermission && (
              <button
                onClick={handleCreate}
                className="group h-8 sm:h-9 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[9px] sm:text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/10 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Create Component</span>
                <span className="sm:hidden">Create</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6">

        {/* Tab Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 px-1">
          <div className="flex w-full md:w-auto items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-inner">
            {[
              { id: 'all', label: 'All', icon: Layers, count: items.length, activeColor: 'slate' },
              { id: 'allowances', label: 'Allowances', icon: ArrowUp, count: items.filter(i => i.category === 'allowance').length, activeColor: 'green' },
              { id: 'deductions', label: 'Deductions', icon: ArrowDown, count: items.filter(i => i.category === 'deduction').length, activeColor: 'red' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group relative flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-1.5 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                  ? `bg-white dark:bg-slate-700 text-${tab.activeColor === 'slate' ? 'slate-900' : tab.activeColor + '-600'} dark:text-${tab.activeColor === 'slate' ? 'white' : tab.activeColor + '-400'} shadow-sm ring-1 ring-slate-200/50 dark:ring-0`
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id
                  ? `text-${tab.activeColor === 'slate' ? 'slate-900' : tab.activeColor + '-600'} dark:text-${tab.activeColor === 'slate' ? 'white' : tab.activeColor + '-400'}`
                  : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${activeTab === tab.id
                    ? `bg-${tab.activeColor}-50 text-${tab.activeColor}-600 dark:bg-${tab.activeColor}-900/30 dark:text-${tab.activeColor}-300`
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50 self-start sm:self-center">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
              title="List View"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'card'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
              title="Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Items Grid (Card-based) */}
        {/* Items Grid/List */}
        {viewMode === 'list' ? (
          /* List View (Table) */
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/60 dark:border-slate-800">
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Name</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Value (Global)</th>
                    <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Range</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Overrides</th>
                    <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                    {hasManagePermission && <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4">
                          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded mx-auto"></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto"></div>
                        </td>
                        {hasManagePermission && (
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
                              <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="flex flex-col items-center justify-center">
                          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                            <Search className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="text-sm font-semibold">No items found</p>
                          <p className="mt-1 text-xs text-slate-400">Try adjusting your filters or search query.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={item._id}
                        className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${item.category === 'allowance'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                {item.category}
                              </span>
                              {item.description && (
                                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={item.description}>
                                  {item.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${item.globalRule.type === 'fixed'
                            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
                            }`}>
                            {item.globalRule.type === 'fixed' ? 'Fixed Amount' : 'Percentage'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {item.globalRule.type === 'fixed' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">
                                ₹{item.globalRule.amount?.toLocaleString() || 0}
                              </span>
                              {item.globalRule.basedOnPresentDays && (
                                <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
                                  Prorated
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-bold text-slate-900 dark:text-white">
                                {item.globalRule.percentage}%
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                of {item.globalRule.percentageBase === 'basic' ? 'Basic' : 'Gross'}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {((item.globalRule.minAmount !== null && item.globalRule.minAmount !== undefined) || (item.globalRule.maxAmount !== null && item.globalRule.maxAmount !== undefined)) ? (
                            <div className="flex flex-col gap-1">
                              {item.globalRule.minAmount !== null && item.globalRule.minAmount !== undefined && (
                                <span className="text-xs text-slate-600 dark:text-slate-400">
                                  Min: ₹{item.globalRule.minAmount.toLocaleString()}
                                </span>
                              )}
                              {item.globalRule.maxAmount !== null && item.globalRule.maxAmount !== undefined && (
                                <span className="text-xs text-slate-600 dark:text-slate-400">
                                  Max: ₹{item.globalRule.maxAmount.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {item.departmentRules && item.departmentRules.length > 0 ? (
                            <button
                              onClick={() => hasManagePermission && handleEdit(item)}
                              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                            >
                              <span>{item.departmentRules.length} Rules</span>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-600">None</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.isActive
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {hasManagePermission && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleAddDeptRule(item)}
                                className="rounded-lg bg-blue-50 p-2 text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
                                title="Add Department Rule"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleEdit(item)}
                                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                                title="Edit"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(item._id)}
                                className="rounded-lg bg-rose-50 p-2 text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
                                title="Delete"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 animate-pulse">
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                    <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
                    <div className="flex gap-2">
                      <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                      <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                    </div>
                  </div>
                </div>
              ))
            ) : filteredItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center p-12 text-center text-slate-500">
                <Wallet className="mb-4 h-12 w-12 text-slate-300" />
                <p>No components found matching your filters.</p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item._id}
                  onClick={() => hasManagePermission && handleEdit(item)}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900
                  ${hasManagePermission ? 'cursor-pointer hover:shadow-md hover:border-blue-200/60 dark:hover:border-blue-900/50' : 'cursor-default'}`}
                >
                  {/* Status Strip */}
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl transition-all group-hover:w-1.5 ${item.category === 'allowance'
                    ? 'bg-emerald-500/80'
                    : 'bg-rose-500/80'
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
                  <div className="mb-3 rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-slate-100/50 p-3 dark:border-slate-700 dark:from-slate-900/50 dark:to-slate-800/50">
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
                          // Check if user has permission to edit/delete
                          const canManageOverrides = hasManagePermission;

                          return (
                            <div
                              key={idx}
                              className="rounded-lg border border-green-200 bg-linear-to-r from-green-50 to-green-50 p-2 dark:border-green-800 dark:from-green-900/20 dark:to-green-900/20"
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
              ))
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      {
        (showCreateDialog || showEditDialog) && (
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
        )
      }

      {/* Department Rule Dialog */}
      {
        showDeptRuleDialog && selectedItem && (
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
        )
      }
    </div >
  );
}


