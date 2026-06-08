'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';
import Spinner from '@/components/Spinner';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansTabBar,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
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
  loansDialogDangerButtonClass,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
} from '@/components/loans/LoanDetailDialogShell';
import {
  ledgerPayComponentBadgeClass,
  ledgerPayComponentCardClass,
  ledgerPayComponentStripClass,
  ledgerStatusBadgeClass,
} from '@/lib/ledgerUi';

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
    return deptId?.name;
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === 'allowances') return item.category === 'allowance';
    if (activeTab === 'deductions') return item.category === 'deduction';
    return true;
  });

  const closeFormDialog = () => {
    setShowCreateDialog(false);
    setShowEditDialog(false);
    setSelectedItem(null);
    resetForm();
  };

  const allowanceCount = items.filter((i) => i.category === 'allowance').length;
  const deductionCount = items.filter((i) => i.category === 'deduction').length;

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Payroll configuration"
        title="Allowances & deductions"
        subtitle="Manage salary components with global rules and department overrides"
        action={
          <button
            type="button"
            onClick={handleCreate}
            className={loansPrimaryButtonClass()}
            style={loansPrimaryButtonStyle()}
          >
            Create component
          </button>
        }
      />

      <LoansTabBar
        tabs={[
          { id: 'all', label: 'All', count: items.length },
          { id: 'allowances', label: 'Allowances', count: allowanceCount },
          { id: 'deductions', label: 'Deductions', count: deductionCount },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'all' | 'allowances' | 'deductions')}
      />

        {loading ? (
          <LoansContentPanel>
          <div className="flex flex-col items-center justify-center py-12">
            <Spinner />
            <p className="mt-3 text-xs font-medium text-stone-500">Loading items…</p>
          </div>
          </LoansContentPanel>
        ) : filteredItems.length === 0 ? (
          <LoansContentPanel>
          <div className="p-8 text-center text-stone-500">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">No items found</p>
            <p className="mt-1.5 text-xs">
              Get started by creating a new {activeTab === 'all' ? 'allowance or deduction' : activeTab}
            </p>
          </div>
          </LoansContentPanel>
        ) : (
          <LoansContentPanel>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <div
                key={item._id}
                onClick={() => handleEdit(item)}
                className={`group relative cursor-pointer border p-5 transition-all hover:opacity-95 ${ledgerPayComponentCardClass(item.category)}`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-1 ${ledgerPayComponentStripClass(item.category)}`}
                />

                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                    )}
                  </div>
                  <div className="ml-2 flex flex-col gap-1.5">
                    <span className={ledgerPayComponentBadgeClass(item.category)}>
                      {item.category === 'allowance' ? 'Allowance' : 'Deduction'}
                    </span>
                    {!item.isActive && (
                      <span className={ledgerStatusBadgeClass('pending')}>Inactive</span>
                    )}
                  </div>
                </div>

                <LoanFormPanel soft className="mb-3 !p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
                    Global rule
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
                </LoanFormPanel>

                {item.departmentRules && item.departmentRules.length > 0 && (
                  <LoanFormPanel soft className="mb-3 !p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
                      Department overrides ({item.departmentRules.length})
                    </p>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {item.departmentRules.slice(0, 2).map((rule, idx) => {
                        const deptId = typeof rule.departmentId === 'string' ? rule.departmentId : rule.departmentId?._id;
                        const divId = rule.divisionId ? (typeof rule.divisionId === 'string' ? rule.divisionId : rule.divisionId._id) : null;
                        const divName = rule.divisionId && typeof rule.divisionId === 'object' ? rule.divisionId.name : null;

                        return (
                          <div
                            key={idx}
                            className="border p-2"
                            style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(var(--ps-accent-rgb), 0.03)' }}
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
                              {/* Action buttons */}
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditDeptRule(item, deptId);
                                  }}
                                  className={loansDialogOutlineButtonClass()}
                                  style={loansDialogOutlineButtonStyle()}
                                  title="Edit this override"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDeptRule(item._id, deptId, divId);
                                  }}
                                  className={loansDialogDangerButtonClass()}
                                  title="Delete this override"
                                >
                                  Del
                                </button>
                              </div>
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
                  </LoanFormPanel>
                )}

                <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--ps-accent-border)' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(item);
                    }}
                    className={`flex-1 ${loansDialogOutlineButtonClass()}`}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddDeptRule(item);
                    }}
                    className={`flex-1 ${loansDialogOutlineButtonClass()}`}
                    style={loansDialogOutlineButtonStyle()}
                  >
                    Override
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item._id);
                    }}
                    className={loansDialogDangerButtonClass()}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          </LoansContentPanel>
        )}

      {(showCreateDialog || showEditDialog) && (
        <LoanDetailDialog open onClose={closeFormDialog} maxWidth="max-w-2xl">
          <LoanDetailDialogHeader
            badge={selectedItem ? 'Edit' : 'Create'}
            title={`${selectedItem ? 'Edit' : 'Create'} ${formData.category === 'allowance' ? 'allowance' : 'deduction'}`}
            subtitle={
              selectedItem
                ? 'Update the allowance or deduction details'
                : 'Add a new salary component to your payroll system'
            }
            onClose={closeFormDialog}
          />
          <LoanDetailDialogBody>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 border-b pb-4" style={{ borderColor: 'var(--ps-accent-border)' }}>
                <span className={ledgerPayComponentBadgeClass(formData.category)}>
                  {formData.category === 'allowance' ? 'Allowance' : 'Deduction'}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {formData.category === 'allowance' ? 'Adds to employee pay' : 'Deducts from employee pay'}
                </span>
              </div>

              {/* Name */}
              <div>
                <LoanFormLabel>
                  Name <span className="text-red-500">*</span>
                </LoanFormLabel>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                  placeholder="e.g., House Rent Allowance, PF Contribution"
                />
              </div>

              {/* Category (only for create) */}
              {!selectedItem && (
                <div>
                  <LoanFormLabel>
                    Category <span className="text-red-500">*</span>
                  </LoanFormLabel>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as 'allowance' | 'deduction' })}
                    className={loansFormSelectClass()}
                    style={loansFormInputStyle()}
                  >
                    <option value="allowance">Allowance — adds to pay</option>
                    <option value="deduction">Deduction — subtracts from pay</option>
                  </select>
                </div>
              )}

              {selectedItem && (
                <div className="rounded border px-3 py-2 text-xs text-stone-600 dark:text-stone-400" style={{ borderColor: 'var(--ps-accent-border)' }}>
                  Category cannot be changed after creation. This item is a{' '}
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    {formData.category === 'allowance' ? 'allowance' : 'deduction'}
                  </span>.
                </div>
              )}

              {/* Description */}
              <div>
                <LoanFormLabel>Description</LoanFormLabel>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className={loansFormTextareaClass()}
                  style={loansFormInputStyle()}
                  placeholder="Optional description"
                />
              </div>

              {/* Type */}
              <div>
                <LoanFormLabel>
                  Calculation Type <span className="text-red-500">*</span>
                </LoanFormLabel>
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
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>

              {/* Fixed Amount */}
              {formData.type === 'fixed' && (
                <div>
                  <LoanFormLabel>
                    Amount (₹) <span className="text-red-500">*</span>
                  </LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount ?? ''}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
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
                    <LoanFormLabel>
                      Percentage (%) <span className="text-red-500">*</span>
                    </LoanFormLabel>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={formData.percentage ?? ''}
                      onChange={(e) => setFormData({ ...formData, percentage: e.target.value ? parseFloat(e.target.value) : null })}
                      className={loansFormInputClass()}
                      style={loansFormInputStyle()}
                      placeholder="e.g., 12, 40"
                    />
                  </div>

                  <div>
                    <LoanFormLabel>
                      Percentage Base <span className="text-red-500">*</span>
                    </LoanFormLabel>
                    <select
                      value={formData.percentageBase}
                      onChange={(e) => setFormData({ ...formData, percentageBase: e.target.value as 'basic' | 'gross' })}
                      className={loansFormSelectClass()}
                    style={loansFormInputStyle()}
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
                  <LoanFormLabel>Min Amount (₹)</LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, minAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <LoanFormLabel>Max Amount (₹)</LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.maxAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                  style={loansFormInputStyle()}
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

            <LoanDialogFooter
              onCancel={closeFormDialog}
              submitLabel={selectedItem ? 'Update' : 'Create'}
              submitType="button"
              onSubmit={handleSave}
            />
          </LoanDetailDialogBody>
        </LoanDetailDialog>
      )}

      {showDeptRuleDialog && selectedItem && (
        <LoanDetailDialog
          open
          onClose={() => {
            setShowDeptRuleDialog(false);
            setSelectedDeptForRule('');
            resetDeptRuleForm();
          }}
          maxWidth="max-w-lg"
        >
          <LoanDetailDialogHeader
            badge="Department override"
            title={`${selectedDeptForRule ? 'Edit' : 'Add'} override`}
            subtitle={`Override global rule for ${selectedItem.name}`}
            onClose={() => {
              setShowDeptRuleDialog(false);
              setSelectedDeptForRule('');
              resetDeptRuleForm();
            }}
          />
          <LoanDetailDialogBody>
            <div className="space-y-4">
              {/* Division (Optional) */}
              <div>
                <LoanFormLabel>
                  Division <span className="text-slate-400">(Optional)</span>
                </LoanFormLabel>
                <select
                  value={deptRuleForm.divisionId}
                  onChange={(e) => setDeptRuleForm({ ...deptRuleForm, divisionId: e.target.value })}
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
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
                <LoanFormLabel>
                  Department <span className="text-red-500">*</span>
                </LoanFormLabel>
                <select
                  value={deptRuleForm.departmentId}
                  onChange={(e) => setDeptRuleForm({ ...deptRuleForm, departmentId: e.target.value })}
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="">Select Department</option>
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
                <LoanFormLabel>
                  Calculation Type <span className="text-red-500">*</span>
                </LoanFormLabel>
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
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>

              {/* Fixed Amount */}
              {deptRuleForm.type === 'fixed' && (
                <div>
                  <LoanFormLabel>
                    Amount (₹) <span className="text-red-500">*</span>
                  </LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.amount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, amount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
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
                    <LoanFormLabel>
                      Percentage (%) <span className="text-red-500">*</span>
                    </LoanFormLabel>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={deptRuleForm.percentage ?? ''}
                      onChange={(e) => setDeptRuleForm({ ...deptRuleForm, percentage: e.target.value ? parseFloat(e.target.value) : null })}
                      className={loansFormInputClass()}
                      style={loansFormInputStyle()}
                      placeholder="e.g., 30"
                    />
                  </div>

                  <div>
                    <LoanFormLabel>
                      Percentage Base <span className="text-red-500">*</span>
                    </LoanFormLabel>
                    <select
                      value={deptRuleForm.percentageBase}
                      onChange={(e) => setDeptRuleForm({ ...deptRuleForm, percentageBase: e.target.value as 'basic' | 'gross' })}
                      className={loansFormSelectClass()}
                    style={loansFormInputStyle()}
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
                  <LoanFormLabel>Min Amount (₹)</LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.minAmount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, minAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                    style={loansFormInputStyle()}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <LoanFormLabel>Max Amount (₹)</LoanFormLabel>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deptRuleForm.maxAmount ?? ''}
                    onChange={(e) => setDeptRuleForm({ ...deptRuleForm, maxAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <LoanDialogFooter
              onCancel={() => {
                setShowDeptRuleDialog(false);
                setSelectedDeptForRule('');
                resetDeptRuleForm();
              }}
              submitLabel={`${selectedDeptForRule ? 'Update' : 'Add'} override`}
              submitType="button"
              onSubmit={handleSaveDeptRule}
            />
          </LoanDetailDialogBody>
        </LoanDetailDialog>
      )}
    </LoansPageShell>
  );
}

