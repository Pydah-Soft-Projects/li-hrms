'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { api, Department, Division, Designation } from '@/lib/api';
import ArrearsDetailDialog from '@/components/Arrears/ArrearsDetailDialog';
import ArrearsForm from '@/components/Arrears/ArrearsForm';
import Spinner from '@/components/Spinner';
import { Plus, Search, Eye, AlertCircle, Users, Loader2 } from 'lucide-react';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansTabBar,
  LoansToolbar,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanFormLabel,
  LoanFormPanel,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansDialogSuccessButtonClass,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
} from '@/components/loans/LoanDetailDialogShell';
import { LedgerCollapsiblePanel } from '@/components/ledger';
import { MultiSelect } from '@/components/MultiSelect';
import { ledgerMoneyClass, ledgerStatusBadgeClass, ledgerActionButtonClass, ledgerTableActionsCellClass, ledgerTableActionsGroupClass, ledgerTableActionsHeaderClass, type LedgerUiStatus } from '@/lib/ledgerUi';
import {
  DEDUCTION_LIST_STATUS_OPTIONS,
  deductionMatchesListOrgAndStatus,
  deductionMatchesSearch,
  deductionMatchesTab,
  departmentsForDivisionFilter,
} from '@/lib/manualDeductionListUi';

const arrearLedgerStatus = (status: string): LedgerUiStatus => {
  if (status === 'approved' || status === 'settled' || status === 'partially_settled') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_hod' || status === 'pending_hr' || status === 'pending_admin') return 'current';
  if (status === 'draft') return 'pending';
  return 'neutral';
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending_hod: 'Pending HOD',
    pending_hr: 'Pending HR',
    pending_admin: 'Pending Admin',
    approved: 'Approved',
    rejected: 'Rejected',
    partially_settled: 'Partially Settled',
    settled: 'Settled',
    cancelled: 'Cancelled'
  };
  return labels[status] || status;
};

interface Arrears {
  _id: string;
  type?: 'incremental' | 'direct';
  employee: { _id: string; emp_no: string; employee_name?: string; first_name?: string; last_name?: string; division_id?: string; department_id?: string; designation_id?: string; leftDate?: string; };
  startMonth?: string;
  endMonth?: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  reason: string;
  createdAt: string;
}

interface BulkArrearRow {
  employee: any;
  amount: number;
  remarks: string;
}

export function ArrearsContent() {
  const [arrears, setArrears] = useState<Arrears[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedArrearsId, setSelectedArrearsId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  // Filter States
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [listFilterDivisions, setListFilterDivisions] = useState<string[]>([]);
  const [listFilterDepartments, setListFilterDepartments] = useState<string[]>([]);
  const [listFilterDesignations, setListFilterDesignations] = useState<string[]>([]);
  const [listFilterStatuses, setListFilterStatuses] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkDivisionId, setBulkDivisionId] = useState('');
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkArrearRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSectionOpen, setBulkSectionOpen] = useState(false);

  useEffect(() => {
    loadData();
    loadEmployees();
    loadDivisions();
    loadDepartments();
    loadDesignations();
  }, []);

  const loadData = () => {
    setLoading(true);

    Promise.resolve(api.getArrears({ limit: 100 }))
      .then((response: any) => {
        if (response.success) {
          setArrears(response.data || []);
        } else {
          toast.error(response.message || 'Failed to load arrears');
        }
      })
      .catch((err: any) => {
        toast.error(err.message || 'Failed to load arrears');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const loadEmployees = () => {
    Promise.resolve(api.getEmployeesSummary({ is_active: true, limit: 500, page: 1 }))
      .then((response: any) => {
        if (response.success) {
          setEmployees(response.data || []);
        }
      })
      .catch((err: any) => {
        console.error('Failed to load employees:', err);
      });
  };

  const loadDivisions = async () => {
    try {
      const response = await api.getDivisions();
      if (response.success && response.data) {
        setDivisions(response.data);
      }
    } catch (err) {
      console.error('Error loading divisions:', err);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments();
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadDesignations = async () => {
    try {
      const response = await api.getAllDesignations();
      if (response.success && response.data) {
        setDesignations(response.data);
      }
    } catch (err) {
      console.error('Error loading designations:', err);
    }
  };

  const handleViewDetails = (id: string) => {
    setSelectedArrearsId(id);
    setDetailDialogOpen(true);
  };

  const handleCreateArrears = async (data: any) => {
    try {
      const response = await api.createArrears(data);
      if (response.success) {
        toast.success('Arrears created successfully');
        setFormOpen(false);
        loadData();
      } else {
        toast.error(response.message || 'Failed to create arrears');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create arrears');
    }
  };

  const listDepartmentOptions = useMemo(
    () => departmentsForDivisionFilter(divisions, departments, listFilterDivisions),
    [listFilterDivisions, divisions, departments],
  );

  useEffect(() => {
    if (listFilterDepartments.length === 0) return;
    const allowed = new Set(listDepartmentOptions.map((d: any) => String(d._id)));
    setListFilterDepartments((prev) => prev.filter((id) => allowed.has(id)));
  }, [listDepartmentOptions, listFilterDivisions]);

  const arrearForFilter = (ar: Arrears) => {
    const master = getEmployeeMasterRecord(ar.employee);
    return {
      status: ar.status,
      reason: ar.reason,
      employee: {
        ...ar.employee,
        employee_name: getEmployeeName(master),
        emp_no: master.emp_no,
        division_id: master.division_id,
        department_id: master.department_id,
        designation_id: master.designation_id,
      },
    };
  };

  const filteredArrears = useMemo(
    () =>
      arrears.filter((ar) => {
        const row = arrearForFilter(ar);
        return (
          deductionMatchesTab(row, activeTab)
          && deductionMatchesSearch(row, searchTerm)
          && deductionMatchesListOrgAndStatus(
            row,
            listFilterDivisions,
            listFilterDepartments,
            listFilterDesignations,
            listFilterStatuses,
          )
        );
      }),
    [
      arrears,
      activeTab,
      searchTerm,
      listFilterDivisions,
      listFilterDepartments,
      listFilterDesignations,
      listFilterStatuses,
      employees,
      divisions,
      departments,
      designations,
    ],
  );

  const anyListFilterActive =
    listFilterDivisions.length > 0
    || listFilterDepartments.length > 0
    || listFilterDesignations.length > 0
    || listFilterStatuses.length > 0;

  const clearListFilters = () => {
    setListFilterDivisions([]);
    setListFilterDepartments([]);
    setListFilterDesignations([]);
    setListFilterStatuses([]);
  };

  const filteredBulkRows = useMemo(() => {
    if (!bulkSearchQuery.trim()) return bulkRows;
    const q = bulkSearchQuery.toLowerCase().trim();
    return bulkRows.filter((row) => {
      const emp = row.employee;
      const name = (emp.employee_name || [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '').toLowerCase();
      const code = (emp.emp_no || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [bulkRows, bulkSearchQuery]);

  const stats = {
    pending: arrears.filter(ar => ['pending_hod', 'pending_hr', 'pending_admin'].includes(ar.status)).length,
    approved: arrears.filter(ar => ar.status === 'approved').length,
    settled: arrears.filter(ar => ar.status === 'settled').length,
    rejected: arrears.filter(ar => ar.status === 'rejected').length
  };

  function getEmployeeName(emp: any) {
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no;
  }

  function getEmployeeMasterRecord(employee: any) {
    const employeeId = String(employee?._id || '');
    if (!employeeId) return employee;
    return (employees as any[]).find((emp: any) => String(emp?._id) === employeeId) || employee;
  }

  const sanitizeDisplayValue = (value: any) => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';
    const lowered = text.toLowerCase();
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') return '';
    return text;
  };

  const resolveEntityName = (value: any, items: any[]) => {
    if (value && typeof value === 'object') {
      return sanitizeDisplayValue((value as any).name) || sanitizeDisplayValue((value as any).code);
    }
    const id = sanitizeDisplayValue(value);
    if (!id) return '';
    const found = items.find((item: any) => String(item?._id) === String(id));
    return sanitizeDisplayValue(found?.name) || sanitizeDisplayValue(found?.code);
  };

  const getDivisionName = (employee: any) => {
    const source = getEmployeeMasterRecord(employee);
    return (
      resolveEntityName(source?.division_id, divisions as any[]) ||
      sanitizeDisplayValue(source?.division_name)
    );
  };

  const getDepartmentName = (employee: any) => {
    const source = getEmployeeMasterRecord(employee);
    return (
      resolveEntityName(source?.department_id, departments as any[]) ||
      sanitizeDisplayValue(source?.department_name)
    );
  };

  const getDesignationName = (employee: any) => {
    const source = getEmployeeMasterRecord(employee);
    return (
      resolveEntityName(source?.designation_id, designations as any[]) ||
      sanitizeDisplayValue(source?.designation_name)
    );
  };

  const filteredBulkDepartments = React.useMemo(() => {
    if (!bulkDivisionId) return departments;
    const div = divisions.find((d) => String(d._id) === String(bulkDivisionId));
    const deptIds = ((div?.departments ?? []) as any[]).map((d: any) => (typeof d === 'string' ? d : d?._id));
    if (!deptIds.length) return departments;
    return departments.filter((d: any) => deptIds.includes(String(d._id)));
  }, [bulkDivisionId, divisions, departments]);

  const loadBulkEmployees = async () => {
    setBulkLoading(true);
    setBulkSearchQuery('');
    try {
      const filters: any = { is_active: true, limit: 500 };
      if (bulkDivisionId) filters.division_id = bulkDivisionId;
      if (bulkDepartmentId) filters.department_id = bulkDepartmentId;
      const r: any = await api.getEmployees(filters);
      const list = (r?.data ?? r) || [];
      const rows: BulkArrearRow[] = list.map((emp: any) => ({
        employee: emp,
        amount: 0,
        remarks: '',
      }));
      setBulkRows(rows);
      toast.info(rows.length ? `Loaded ${rows.length} employees` : 'No employees match filters');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load employees');
    } finally {
      setBulkLoading(false);
    }
  };

  const updateBulkRow = (index: number, field: 'amount' | 'remarks', value: number | string) => {
    setBulkRows((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleBulkSave = async () => {
    const toCreate = bulkRows.filter((r) => Number(r.amount) > 0);
    if (toCreate.length === 0) {
      toast.warn('Enter amount > 0 for at least one employee');
      return;
    }
    setBulkSaving(true);
    try {
      const settled = await Promise.allSettled(
        toCreate.map((r) =>
          api.createArrears({
            type: 'direct',
            employee: r.employee._id,
            totalAmount: Number(r.amount),
            reason: (r.remarks || 'Bulk arrear').trim(),
          })
        )
      );
      const success = settled.filter((x) => x.status === 'fulfilled').length;
      const failed = settled.length - success;
      if (success > 0) {
        toast.success(`${success} arrears request(s) created`);
        loadData();
        setBulkRows((prev) =>
          prev.map((r) => (Number(r.amount) > 0 ? { ...r, amount: 0, remarks: '' } : r))
        );
      }
      if (failed > 0) {
        toast.error(`${failed} request(s) failed`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Bulk create failed');
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <LoansPageHeader
        badge="Payroll arrears"
        title="Arrears"
        subtitle="Additional pay owed to employees — provision, approval, and settlement"
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={`flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <Plus className="h-4 w-4" /> Provision arrear
          </button>
        }
      />

      <LoansStatGrid
        stats={[
          { label: 'Pending review', value: stats.pending, accent: true },
          { label: 'Approved', value: stats.approved },
          { label: 'Settled', value: stats.settled },
          { label: 'Rejected', value: stats.rejected, muted: true },
        ]}
      />

      <div className="mb-5">
        <LedgerCollapsiblePanel
          title="Bulk create requests"
          subtitle="Filter employees, set amount and remarks, then save to create one direct arrear per row (amount > 0)"
          icon={<Users className="h-5 w-5" />}
          open={bulkSectionOpen}
          onToggle={() => setBulkSectionOpen((o) => !o)}
        >
          <LoanFormPanel soft className="!p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[180px]">
                <LoanFormLabel>Division</LoanFormLabel>
                <select
                  value={bulkDivisionId}
                  onChange={(e) => { setBulkDivisionId(e.target.value); setBulkDepartmentId(''); }}
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="">All divisions</option>
                  {divisions.map((d: any) => (
                    <option key={d._id} value={d._id}>{d.name || d.code || d._id}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px]">
                <LoanFormLabel>Department</LoanFormLabel>
                <select
                  value={bulkDepartmentId}
                  onChange={(e) => setBulkDepartmentId(e.target.value)}
                  className={loansFormSelectClass()}
                  style={loansFormInputStyle()}
                >
                  <option value="">All departments</option>
                  {filteredBulkDepartments.map((d: any) => (
                    <option key={d._id} value={d._id}>{d.name || d.code || d._id}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={loadBulkEmployees}
                disabled={bulkLoading}
                className={`flex items-center gap-2 ${loansPrimaryButtonClass()}`}
                style={loansPrimaryButtonStyle()}
              >
                {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Load employees
              </button>
              {bulkRows.length > 0 && (
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    placeholder="Search loaded employees…"
                    className={`${loansFormInputClass()} pl-10`}
                    style={loansFormInputStyle()}
                  />
                </div>
              )}
            </div>
          </LoanFormPanel>

          {bulkRows.length > 0 && (
            <>
              <LoansContentPanel>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--ps-accent-border)' }}>
                      <th className={`px-4 py-3 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Employee</th>
                      <th className={`px-4 py-3 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Department</th>
                      <th className={`px-4 py-3 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Amount (₹)</th>
                      <th className={`px-4 py-3 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--ps-accent-border)' }}>
                    {filteredBulkRows.map((row) => {
                      const originalIndex = bulkRows.findIndex((r) => r.employee._id === row.employee._id);
                      return (
                        <tr key={row.employee._id} className="hover:opacity-95" style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.01)' }}>
                          <td className="px-4 py-2 font-medium text-slate-950 dark:text-white">
                            {row.employee.employee_name || [row.employee.first_name, row.employee.last_name].filter(Boolean).join(' ') || row.employee.emp_no || '—'}
                          </td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                            {(row.employee.department_id as any)?.name || '—'}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={row.amount === 0 ? '' : row.amount}
                              onChange={(e) => updateBulkRow(originalIndex, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                              className={`${loansFormInputClass()} text-right`}
                              style={loansFormInputStyle()}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={row.remarks}
                              onChange={(e) => updateBulkRow(originalIndex, 'remarks', e.target.value)}
                              className={loansFormInputClass()}
                              style={loansFormInputStyle()}
                              placeholder="Remarks"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </LoansContentPanel>
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--ps-accent-border)' }}>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {bulkRows.filter((r) => Number(r.amount) > 0).length} row(s) with amount &gt; 0 will create arrear requests
                </p>
                <button
                  type="button"
                  onClick={handleBulkSave}
                  disabled={bulkSaving || bulkRows.every((r) => Number(r.amount) <= 0)}
                  className={`flex items-center gap-2 ${loansDialogSuccessButtonClass()}`}
                >
                  {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save (create requests)
                </button>
              </div>
            </>
          )}
        </LedgerCollapsiblePanel>
      </div>

      <LoansTabBar
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Pending' },
          { id: 'approved', label: 'Approved' },
          { id: 'settled', label: 'Settled' },
          { id: 'rejected', label: 'Rejected' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <LoansToolbar>
        <div className="flex flex-wrap items-end gap-3">
          <MultiSelect
            variant="ledger"
            label="Division"
            options={divisions.map((d) => ({ id: String(d._id), name: d.name ?? d.code ?? 'Division' }))}
            selectedIds={listFilterDivisions}
            onChange={(vals) => {
              setListFilterDivisions(vals);
              setListFilterDepartments([]);
            }}
            placeholder="All divisions"
            className="w-full sm:w-40 md:w-44"
          />
          <MultiSelect
            variant="ledger"
            label="Department"
            options={listDepartmentOptions.map((d: any) => ({
              id: String(d._id),
              name: d.name ?? 'Department',
            }))}
            selectedIds={listFilterDepartments}
            onChange={setListFilterDepartments}
            placeholder="All departments"
            className="w-full sm:w-40 md:w-44"
          />
          <MultiSelect
            variant="ledger"
            label="Designation"
            options={designations.map((d) => ({
              id: String(d._id),
              name: d.name ?? (d as { title?: string }).title ?? 'Designation',
            }))}
            selectedIds={listFilterDesignations}
            onChange={setListFilterDesignations}
            placeholder="All designations"
            className="w-full sm:w-40 md:w-44"
          />
          <MultiSelect
            variant="ledger"
            label="Status"
            options={DEDUCTION_LIST_STATUS_OPTIONS}
            selectedIds={listFilterStatuses}
            onChange={setListFilterStatuses}
            placeholder="All statuses"
            className="w-full sm:w-48 md:w-56"
          />
          <div className="flex w-full flex-col gap-1.5 sm:w-44 md:w-52">
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--ps-accent-ink)' }}
            >
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Name, ID, reason…"
                className={`h-10 pl-9 pr-3 ${loansFormInputClass()}`}
                style={loansFormInputStyle()}
              />
            </div>
          </div>
          {anyListFilterActive && (
            <button
              type="button"
              onClick={clearListFilters}
              className={`h-10 ${loansDialogOutlineButtonClass()}`}
              style={loansDialogOutlineButtonStyle()}
            >
              Clear filters
            </button>
          )}
        </div>
      </LoansToolbar>

      <LoansContentPanel>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center"><Spinner /></div>
          ) : filteredArrears.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <AlertCircle className="mb-4 h-12 w-12 text-slate-400" />
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">No arrears found</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Create an arrear or adjust filters.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--ps-accent-border)' }}>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Employee</th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Division / Dept</th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Period / Type</th>
                  <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Total</th>
                  <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Remaining</th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Status</th>
                  <th className={`px-6 py-4 ${ledgerTableActionsHeaderClass('right')} ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--ps-accent-border)' }}>
                {filteredArrears.map((ar) => (
                  <tr key={ar._id} className="hover:opacity-95" style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.01)' }}>
                    <td className="px-6 py-4 text-sm">
                      <div className="min-w-0" title={[getEmployeeName(ar.employee), getDesignationName(ar.employee), ar.employee?.emp_no].filter(Boolean).join(' · ')}>
                        <div className="truncate font-semibold text-slate-900 dark:text-white">{getEmployeeName(ar.employee) || '—'}</div>
                        {getDesignationName(ar.employee) ? (
                          <div className="mt-1 truncate text-[9px] italic text-slate-600 dark:text-slate-400">{getDesignationName(ar.employee)}</div>
                        ) : null}
                        {ar.employee?.emp_no ? (
                          <div className="mt-1 truncate text-[9px] text-slate-500">{ar.employee.emp_no}</div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                      {getDivisionName(ar.employee) || '—'}
                      <span className="text-slate-400"> / </span>
                      {getDepartmentName(ar.employee) || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                      {ar.type === 'direct' ? 'Direct' : (ar.startMonth && ar.endMonth ? `${ar.startMonth} – ${ar.endMonth}` : '—')}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${ledgerMoneyClass()}`}>
                      ₹{Number(ar.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${ledgerMoneyClass()}`}>
                      ₹{Number(ar.remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={ledgerStatusBadgeClass(arrearLedgerStatus(ar.status))}>{getStatusLabel(ar.status)}</span>
                    </td>
                    <td className={`px-6 py-4 ${ledgerTableActionsCellClass('right')}`}>
                      <div className={ledgerTableActionsGroupClass('right')}>
                        <button
                          type="button"
                          onClick={() => handleViewDetails(ar._id)}
                          className={ledgerActionButtonClass('sky', 'outline')}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </LoansContentPanel>

      <ArrearsDetailDialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        arrearsId={selectedArrearsId}
        onUpdate={loadData}
      />

      {formOpen && (
        <ArrearsForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSubmit={handleCreateArrears}
          employees={employees}
        />
      )}
    </LoansPageShell>
  );
}

export default function ArrearsPage() {
  return <ArrearsContent />;
}
