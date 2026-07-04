'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { api } from '@/lib/api';
import DeductionForm from '@/components/ManualDeductions/DeductionForm';
import Spinner from '@/components/Spinner';
import { Plus, Search, Eye, CheckCircle, Clock, TrendingDown, XCircle, AlertCircle, Users, Loader2, Trash2, Pencil } from 'lucide-react';
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
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDetailSection,
  LoanDetailSectionTitle,
  LoanFormLabel,
  LoanFormPanel,
  loansDialogSuccessButtonClass,
  loansDialogDangerButtonClass,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansFormTextareaClass,
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

const deductionLedgerStatus = (status: string): LedgerUiStatus => {
  if (status === 'approved' || status === 'settled' || status === 'partially_settled') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending_hod' || status === 'pending_hr' || status === 'pending_admin') return 'current';
  if (status === 'draft') return 'pending';
  return 'neutral';
};

const getStatusLabel = (s: string) => ({ draft: 'Draft', pending_hod: 'Pending HOD', pending_hr: 'Pending HR', pending_admin: 'Pending Admin', approved: 'Approved', rejected: 'Rejected', partially_settled: 'Partially Settled', settled: 'Settled', cancelled: 'Cancelled' }[s] || s);

interface Deduction {
  _id: string;
  type?: 'incremental' | 'direct';
  employee: {
    _id: string;
    emp_no?: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    division_id?: { _id?: string; name?: string; code?: string } | string;
    department_id?: { _id?: string; name?: string; code?: string } | string;
    designation_id?: { _id?: string; name?: string; code?: string; title?: string } | string;
  };
  startMonth?: string;
  endMonth?: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  reason: string;
  createdAt: string;
}

interface BulkRow {
  employee: { _id: string; emp_no?: string; employee_name?: string; first_name?: string; last_name?: string; leftDate?: string; department_id?: { _id: string; name?: string } | string; division_id?: { _id: string; name?: string } | string; designation_id?: { _id?: string; name?: string; code?: string; title?: string } | string };
  amount: number;
  remarks: string;
}

export function ManualDeductionsContent() {
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Bulk create
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [bulkDivisionId, setBulkDivisionId] = useState('');
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSectionOpen, setBulkSectionOpen] = useState(false);
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkMonth, setBulkMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [designations, setDesignations] = useState<any[]>([]);
  const [listFilterDivisions, setListFilterDivisions] = useState<string[]>([]);
  const [listFilterDepartments, setListFilterDepartments] = useState<string[]>([]);
  const [listFilterDesignations, setListFilterDesignations] = useState<string[]>([]);
  const [listFilterStatuses, setListFilterStatuses] = useState<string[]>([]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    api.getDivisions?.().then((r: any) => { if (r?.success && r?.data) setDivisions(r.data); if (Array.isArray(r)) setDivisions(r); }).catch(() => {});
    api.getDepartments?.().then((r: any) => { if (r?.success && r?.data) setDepartments(r.data); if (Array.isArray(r)) setDepartments(r); }).catch(() => {});
    api.getDesignations?.().then((r: any) => { if (r?.success && r?.data) setDesignations(r.data); if (Array.isArray(r)) setDesignations(r); }).catch(() => {});
  }, []);

  const filteredBulkDepartments = useMemo(() => {
    if (!bulkDivisionId) return departments;
    const div = divisions.find((d: any) => String(d._id) === bulkDivisionId);
    const deptIds = (div?.departments ?? []).map((d: any) => (typeof d === 'string' ? d : d?._id));
    if (deptIds.length === 0) return departments.filter((d: any) => String(d.division_id || d.division) === bulkDivisionId);
    return departments.filter((d: any) => deptIds.includes(String(d._id)));
  }, [bulkDivisionId, divisions, departments]);

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

  const loadBulkEmployees = () => {
    setBulkLoading(true);
    setBulkSearchQuery('');
    
    // Calculate start and end of selected month
    const [year, monthNum] = bulkMonth.split('-').map(Number);
    const startDate = format(new Date(year, monthNum - 1, 1), 'yyyy-MM-dd');
    const endDate = format(new Date(year, monthNum, 0), 'yyyy-MM-dd');

    const filters: any = { 
      includeLeft: true,
      startDate,
      endDate,
      limit: 1000 
    };
    if (bulkDivisionId) filters.division_id = bulkDivisionId;
    if (bulkDepartmentId) filters.department_id = bulkDepartmentId;
    api.getEmployees(filters)
      .then((r: any) => {
        const list = (r?.data ?? r) || [];
        const rows: BulkRow[] = list.map((emp: any) => ({
          employee: emp,
          amount: 0,
          remarks: '',
        }));
        setBulkRows(rows);
        toast.info(rows.length ? `Loaded ${rows.length} employees` : 'No employees match filters');
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load employees'))
      .finally(() => setBulkLoading(false));
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
      const res = await api.createDeductionsBulk(
        toCreate.map((r) => ({
          employee: r.employee._id,
          amount: Number(r.amount),
          reason: (r.remarks || 'Bulk deduction').trim(),
        }))
      ) as { created?: number; failed?: number };
      const created = res?.created ?? 0;
      const failed = res?.failed ?? 0;
      if (created) {
        toast.success(`${created} deduction request(s) created`);
        loadData();
        setBulkRows((prev) => prev.map((r) => (Number(r.amount) > 0 ? { ...r, amount: 0, remarks: '' } : r)));
      }
      if (failed) toast.error(`${failed} failed`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk create failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const loadData = () => {
    setLoading(true);
    api.getManualDeductions({})
      .then((r: any) => { if (r.success) setDeductions(r.data || []); else toast.error(r.message || 'Failed to load'); })
      .catch((e: any) => toast.error(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  const handleCreateSubmit = (data: any) => {
    return api.createDeduction(data).then((r: any) => {
      if (r.success) { toast.success('Manual deduction created'); setFormOpen(false); loadData(); }
      else throw new Error(r.message || 'Create failed');
    });
  };

  const getEntityName = (entity: any) => {
    if (!entity) return '—';
    if (typeof entity === 'string') return entity;
    return entity.name || entity.title || entity.code || '—';
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

  const filtered = useMemo(
    () =>
      deductions.filter(
        (d) =>
          deductionMatchesTab(d, activeTab)
          && deductionMatchesSearch(d, searchTerm)
          && deductionMatchesListOrgAndStatus(
            d,
            listFilterDivisions,
            listFilterDepartments,
            listFilterDesignations,
            listFilterStatuses,
          ),
      ),
    [
      deductions,
      activeTab,
      searchTerm,
      listFilterDivisions,
      listFilterDepartments,
      listFilterDesignations,
      listFilterStatuses,
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

  const stats = {
    pending: deductions.filter((d) => ['pending_hod', 'pending_hr', 'pending_admin'].includes(d.status)).length,
    approved: deductions.filter((d) => d.status === 'approved').length,
    settled: deductions.filter((d) => d.status === 'settled').length,
    rejected: deductions.filter((d) => d.status === 'rejected').length,
  };

  const getEmployeeName = (emp: any) => emp?.employee_name || (emp?.first_name && emp?.last_name ? `${emp.first_name} ${emp.last_name}` : emp?.first_name) || emp?.emp_no || '—';

  const pendingStatuses = ['pending_hod', 'pending_hr', 'pending_admin'];
  const actionableStatuses = ['draft', ...pendingStatuses];
  const removableStatuses = ['draft', ...pendingStatuses, 'approved', 'rejected'];
  const selectableFiltered = filtered.filter((d) => actionableStatuses.includes(d.status));
  const selectedSelectable = selectableFiltered.filter((d) => selectedIds.has(d._id));
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedSelectable.length === selectableFiltered.length) setSelectedIds((prev) => { const n = new Set(prev); selectableFiltered.forEach((d) => n.delete(d._id)); return n; });
    else setSelectedIds((prev) => { const n = new Set(prev); selectableFiltered.forEach((d) => n.add(d._id)); return n; });
  };
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    const some = selectedSelectable.length > 0;
    const all = selectedSelectable.length === selectableFiltered.length && selectableFiltered.length > 0;
    el.checked = all;
    el.indeterminate = some && !all;
  }, [selectedSelectable.length, selectableFiltered.length]);
  const handleBulkApprove = async () => {
    const selected = Array.from(selectedIds)
      .map((id) => deductions.find((x) => x._id === id))
      .filter((d): d is Deduction => !!d && actionableStatuses.includes(d.status));
    if (selected.length === 0) {
      toast.warn('Select at least one draft or pending request to approve to next level');
      return;
    }
    setBulkApproving(true);
    try {
      const draftIds = selected.filter((d) => d.status === 'draft').map((d) => d._id);
      const pendingIds = selected.filter((d) => pendingStatuses.includes(d.status)).map((d) => d._id);
      let approved = 0;
      let failed = 0;
      for (const id of draftIds) {
        try {
          await api.submitDeductionForApproval(id);
          approved += 1;
        } catch {
          failed += 1;
        }
      }
      if (pendingIds.length > 0) {
        const res = await api.bulkApproveDeductions(pendingIds) as { approved?: number; failed?: number };
        approved += res?.approved ?? 0;
        failed += res?.failed ?? 0;
      }
      if (approved) {
        toast.success(`${approved} request(s) approved / submitted to next level`);
        setSelectedIds(new Set());
        loadData();
      }
      if (failed) toast.error(`${failed} failed`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk approve failed');
    } finally {
      setBulkApproving(false);
    }
  };

  const handleBulkReject = async () => {
    const selected = Array.from(selectedIds)
      .map((id) => deductions.find((x) => x._id === id))
      .filter((d): d is Deduction => !!d && actionableStatuses.includes(d.status));
    if (selected.length === 0) {
      toast.warn('Select at least one draft or pending request to reject');
      return;
    }
    setBulkRejecting(true);
    try {
      let done = 0;
      let failed = 0;
      for (const d of selected) {
        try {
          if (d.status === 'draft') {
            await api.cancelDeduction(d._id);
          } else {
            await api.processDeductionAction(d._id, false);
          }
          done += 1;
        } catch {
          failed += 1;
        }
      }
      if (done) {
        toast.success(`${done} request(s) rejected / cancelled`);
        setSelectedIds(new Set());
        loadData();
      }
      if (failed) toast.error(`${failed} failed`);
    } catch (e: any) {
      toast.error(e?.message || 'Bulk reject failed');
    } finally {
      setBulkRejecting(false);
    }
  };

  const handleRemove = async (deduction: Deduction) => {
    if (!removableStatuses.includes(deduction.status)) {
      toast.warn('Only un-settled deductions can be removed');
      return;
    }
    const confirmed = window.confirm('Remove this deduction request? It will be cancelled and kept for audit history.');
    if (!confirmed) return;
    setRemovingId(deduction._id);
    try {
      await api.removeDeduction(deduction._id);
      toast.success('Deduction removed successfully');
      if (selectedId === deduction._id) {
        setDetailOpen(false);
        setSelectedId(null);
      }
      loadData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove deduction');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <LoansPageShell>
      <ToastContainer position="top-right" autoClose={3000} />

      <LoansPageHeader
        badge="Payroll deductions"
        title="Manual deductions"
        subtitle="Deduction from pay — same flow as arrears, applied as a deduction"
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className={`flex items-center gap-2 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <Plus className="h-4 w-4" /> Provision deduction
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
          subtitle="Filter employees, set amount and remarks, then save to create one deduction per row (amount > 0)"
          icon={<Users className="h-5 w-5" />}
          open={bulkSectionOpen}
          onToggle={() => setBulkSectionOpen((o) => !o)}
        >
            <LoanFormPanel soft className="!p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[150px]">
                <LoanFormLabel>Pay period</LoanFormLabel>
                <input
                  type="month"
                  value={bulkMonth}
                  onChange={(e) => setBulkMonth(e.target.value)}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                />
              </div>
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
                        const originalIndex = bulkRows.findIndex(r => r.employee._id === row.employee._id);
                        return (
                          <tr key={row.employee._id} className="hover:opacity-95" style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.01)' }}>
                            <td className="px-4 py-2 font-medium text-slate-950 dark:text-white">
                              <div className="min-w-0" title={[String(row.employee?.employee_name || '—'), getEntityName(row.employee?.designation_id) || undefined, String(row.employee.emp_no || '')].filter(Boolean).join(' · ')}>
  <div className={`font-semibold truncate text-slate-900 dark:text-white text-sm`}>
    {row.employee?.employee_name || '—'}
  </div>
  {getEntityName(row.employee?.designation_id) || undefined ? (
    <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
      {getEntityName(row.employee?.designation_id) || undefined}
    </div>
  ) : null}
  {row.employee.emp_no ? (
    <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{row.employee.emp_no}</div>
  ) : null}
  {row.employee.leftDate ? (
    <div className="mt-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
      Left at {format(new Date(row.employee.leftDate), 'yyyy-MM-dd')}
    </div>
  ) : null}
</div>
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
                    {bulkRows.filter((r) => Number(r.amount) > 0).length} row(s) with amount &gt; 0 will create deduction requests
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
        <div className="flex flex-col gap-4">
          {selectableFiltered.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--ps-accent-border)' }}>
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkApproving || bulkRejecting || selectedSelectable.length === 0}
                className={loansDialogSuccessButtonClass()}
                title={selectedSelectable.length === 0 ? 'Select one or more rows below' : `Approve ${selectedSelectable.length} to next level`}
              >
                {bulkApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Approve to next level ({selectedSelectable.length})
              </button>
              <button
                type="button"
                onClick={handleBulkReject}
                disabled={bulkApproving || bulkRejecting || selectedSelectable.length === 0}
                className={loansDialogDangerButtonClass()}
                title={selectedSelectable.length === 0 ? 'Select one or more rows below' : `Reject ${selectedSelectable.length} selected`}
              >
                {bulkRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject selected ({selectedSelectable.length})
              </button>
              {selectedSelectable.length === 0 && (
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  Select draft or pending row(s), then use Approve / Reject
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <MultiSelect
              variant="ledger"
              label="Division"
              options={divisions.map((d: any) => ({
                id: String(d._id),
                name: d.name ?? d.code ?? 'Division',
              }))}
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
                name: d.name ?? d.department_name ?? 'Department',
              }))}
              selectedIds={listFilterDepartments}
              onChange={setListFilterDepartments}
              placeholder="All departments"
              className="w-full sm:w-40 md:w-44"
            />
            <MultiSelect
              variant="ledger"
              label="Designation"
              options={designations.map((d: any) => ({
                id: String(d._id),
                name: d.name ?? d.title ?? d.code ?? 'Designation',
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

          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search employee, ID, division, department, designation, or reason…"
              className={`w-full pl-10 ${loansFormInputClass()}`}
              style={loansFormInputStyle()}
            />
          </div>
        </div>
      </LoansToolbar>

      <LoansContentPanel>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center"><Spinner /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <AlertCircle className="h-12 w-12 text-slate-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-950 dark:text-white">No deductions found</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Create a manual deduction or adjust filters.</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--ps-accent-border)' }}>
                  <th className="px-4 py-4 text-left w-10">
                    {selectableFiltered.length > 0 && (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={selectedSelectable.length === selectableFiltered.length && selectableFiltered.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300"
                        title={selectedSelectable.length === 0 ? 'Select all (draft/pending)' : selectedSelectable.length === selectableFiltered.length ? 'Deselect all' : 'Select all'}
                      />
                    )}
                  </th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Employee</th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Period / Type</th>
                  <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Total</th>
                  <th className={`px-6 py-4 text-right ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Remaining</th>
                  <th className={`px-6 py-4 text-left ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Status</th>
                  <th className={`px-6 py-4 ${ledgerTableActionsHeaderClass('right')} ${loansTableHeadClass()}`} style={loansTableHeadStyle()}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--ps-accent-border)' }}>
                {filtered.map((d) => (
                  <tr key={d._id} className="hover:opacity-95" style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.01)' }}>
                    <td className="px-4 py-4">
                      {actionableStatuses.includes(d.status) && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(d._id)}
                          onChange={() => toggleSelection(d._id)}
                          className="rounded border-slate-300"
                          title={d.status === 'draft' ? 'Select to submit or cancel' : 'Select to approve or reject'}
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="min-w-0" title={[String(getEmployeeName(d.employee) || '—'), getEntityName(d.employee?.designation_id) || undefined, String(d.employee?.emp_no || '')].filter(Boolean).join(' · ')}>
  <div className={`font-semibold truncate text-slate-900 dark:text-white text-sm`}>
    {getEmployeeName(d.employee) || '—'}
  </div>
  {getEntityName(d.employee?.designation_id) || undefined ? (
    <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
      {getEntityName(d.employee?.designation_id) || undefined}
    </div>
  ) : null}
  {d.employee?.emp_no ? (
    <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{d.employee?.emp_no}</div>
  ) : null}
</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {getEntityName(d.employee?.division_id)} / {getEntityName(d.employee?.department_id)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                      {d.type === 'direct' ? 'Direct' : (d.startMonth && d.endMonth ? `${d.startMonth} – ${d.endMonth}` : '—')}
                    </td>
                    <td className={`px-6 py-4 text-right text-sm ${ledgerMoneyClass(true)}`}>₹{Number(d.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-4 text-right text-sm ${ledgerMoneyClass()}`}>₹{Number(d.remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4">
                      <span className={ledgerStatusBadgeClass(deductionLedgerStatus(d.status))}>{getStatusLabel(d.status)}</span>
                    </td>
                    <td className={`px-6 py-4 ${ledgerTableActionsCellClass('right')}`}>
                      <div className={ledgerTableActionsGroupClass('right')}>
                        <button
                          type="button"
                          onClick={() => { setSelectedId(d._id); setDetailOpen(true); }}
                          className={ledgerActionButtonClass('sky', 'outline')}
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        {removableStatuses.includes(d.status) && (
                          <button
                            type="button"
                            onClick={() => handleRemove(d)}
                            disabled={removingId === d._id}
                            className={ledgerActionButtonClass('rose', 'outline')}
                          >
                            {removingId === d._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </LoansContentPanel>

      {formOpen && (
        <DeductionForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {detailOpen && selectedId && (
        <DeductionDetailModal
          deductionId={selectedId}
          onClose={() => { setDetailOpen(false); setSelectedId(null); }}
          onUpdate={loadData}
        />
      )}
    </LoansPageShell>
  );
}

function DeductionDetailModal({ deductionId, onClose, onUpdate }: { deductionId: string; onClose: () => void; onUpdate: () => void }) {
  const [deduction, setDeduction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    startMonth: '',
    endMonth: '',
    monthlyAmount: '',
    totalAmount: '',
    reason: '',
  });
  const getEntityName = (entity: any) => {
    if (!entity) return '—';
    if (typeof entity === 'string') return entity;
    return entity.name || entity.title || entity.code || '—';
  };
  const getEmployeeName = (emp: any) =>
    emp?.employee_name ||
    ([emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || '') ||
    emp?.emp_no ||
    '—';
  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return format(date, 'dd MMM yyyy, hh:mm a');
  };

  const refresh = () => {
    if (!deductionId) return;
    setLoading(true);
    api.getDeductionById(deductionId)
      .then((r: any) => { if (r.success) setDeduction(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (deductionId) refresh();
  }, [deductionId]);

  useEffect(() => {
    if (!deduction) return;
    setEditForm({
      startMonth: deduction.startMonth || '',
      endMonth: deduction.endMonth || '',
      monthlyAmount: deduction.monthlyAmount != null ? String(deduction.monthlyAmount) : '',
      totalAmount: deduction.totalAmount != null ? String(deduction.totalAmount) : '',
      reason: deduction.reason || '',
    });
    setEditMode(false);
  }, [deduction]);

  const pendingStatuses = ['pending_hod', 'pending_hr', 'pending_admin'];
  const actionableStatuses = ['draft', ...pendingStatuses];
  const removableStatuses = ['draft', ...pendingStatuses, 'approved', 'rejected'];
  const canAct = deduction && actionableStatuses.includes(deduction.status);
  const isDraft = deduction?.status === 'draft';
  const canEdit = deduction && !['settled', 'partially_settled', 'cancelled'].includes(deduction.status);
  const canRemove = deduction && removableStatuses.includes(deduction.status);

  const handleAction = async (approved: boolean) => {
    if (!deductionId || actionLoading) return;
    const comments = actionComment.trim() || undefined;
    setActionLoading(true);
    try {
      if (isDraft) {
        if (approved) {
          await api.submitDeductionForApproval(deductionId);
          toast.success('Submitted for HOD approval');
        } else {
          await api.cancelDeduction(deductionId);
          toast.success('Deduction cancelled');
        }
      } else {
        await api.processDeductionAction(deductionId, approved, comments);
        toast.success(approved ? 'Approved — moved to next level' : 'Deduction rejected');
      }
      onUpdate();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || (approved ? 'Action failed' : 'Reject failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!deductionId || !deduction) return;
    const previousStatus = deduction.status;
    const payload: any = {
      reason: editForm.reason.trim(),
      totalAmount: Number(editForm.totalAmount),
    };
    if (!payload.reason) {
      toast.error('Reason is required');
      return;
    }
    if (!Number.isFinite(payload.totalAmount) || payload.totalAmount <= 0) {
      toast.error('Valid total amount is required');
      return;
    }
    if (deduction.type === 'incremental') {
      if (!editForm.startMonth || !editForm.endMonth) {
        toast.error('Start and end month are required');
        return;
      }
      if (editForm.startMonth > editForm.endMonth) {
        toast.error('Start month must be before or equal to end month');
        return;
      }
      const monthlyAmount = Number(editForm.monthlyAmount);
      if (!Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
        toast.error('Valid monthly amount is required');
        return;
      }
      payload.startMonth = editForm.startMonth;
      payload.endMonth = editForm.endMonth;
      payload.monthlyAmount = monthlyAmount;
    }
    setSavingEdit(true);
    try {
      const res: any = await api.editDeduction(deductionId, payload);
      const nextStatus = res?.data?.status ?? res?.data?.displayStatus ?? '';
      const msg = res?.message || 'Deduction request updated';
      toast.success(msg);

      if (previousStatus !== 'pending_hod' && nextStatus === 'pending_hod') {
        toast.info('Workflow moved to Pending HOD for re-approval.');
        setActionComment('');
      }
      onUpdate();
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update deduction');
    } finally {
      setSavingEdit(false);
      setEditMode(false);
    }
  };

  const handleRemove = async () => {
    if (!deductionId || !canRemove || removeLoading) return;
    const confirmed = window.confirm('Remove this deduction request? It will be cancelled and kept for audit history.');
    if (!confirmed) return;
    setRemoveLoading(true);
    try {
      await api.removeDeduction(deductionId);
      toast.success('Deduction removed successfully');
      onUpdate();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove deduction');
    } finally {
      setRemoveLoading(false);
    }
  };

  if (!deductionId) return null;

  return (
    <LoanDetailDialog open onClose={onClose} maxWidth="max-w-4xl">
        <LoanDetailDialogHeader
          badge="Manual deduction"
          title="Deduction details"
          subtitle={deduction ? getEmployeeName(deduction.employee) : undefined}
          onClose={onClose}
        />
        <LoanDetailDialogBody>
          {deduction && (canEdit || canRemove) && (
            <div className="mb-4 flex justify-end gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    if (editMode) {
                      setEditMode(false);
                      setEditForm({
                        startMonth: deduction.startMonth || '',
                        endMonth: deduction.endMonth || '',
                        monthlyAmount: deduction.monthlyAmount != null ? String(deduction.monthlyAmount) : '',
                        totalAmount: deduction.totalAmount != null ? String(deduction.totalAmount) : '',
                        reason: deduction.reason || '',
                      });
                    } else {
                      setEditMode(true);
                    }
                  }}
                  disabled={savingEdit}
                  title={editMode ? 'Cancel edit' : 'Edit deduction'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border text-stone-700 transition-colors hover:bg-stone-50 dark:text-stone-200 dark:hover:bg-stone-900 disabled:opacity-50"
                  style={{ borderColor: 'var(--ps-accent-border)' }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removeLoading}
                  title="Remove deduction"
                  className={loansDialogDangerButtonClass()}
                >
                  {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : deduction ? (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <LoanDetailSection soft className="!p-4 text-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <LoanDetailSectionTitle className="mb-0">Deduction details</LoanDetailSectionTitle>
                      <p className="mt-1 text-xs font-black text-slate-950 dark:text-white">
                        {deduction.type === 'direct' ? 'Direct' : 'Incremental'}
                      </p>
                    </div>
                    <span className={ledgerStatusBadgeClass(deductionLedgerStatus(deduction.status))}>
                      {getStatusLabel(deduction.status)}
                    </span>
                  </div>

                  {deduction.type !== 'direct' && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <LoanFormLabel>Start month</LoanFormLabel>
                        {editMode ? (
                          <input
                            type="month"
                            value={editForm.startMonth}
                            onChange={(e) => setEditForm((p) => ({ ...p, startMonth: e.target.value }))}
                            className={loansFormInputClass()}
                            style={loansFormInputStyle()}
                          />
                        ) : (
                          <span className="mt-1 block text-slate-900 dark:text-slate-100">{deduction.startMonth || '—'}</span>
                        )}
                      </div>
                      <div>
                        <LoanFormLabel>End month</LoanFormLabel>
                        {editMode ? (
                          <input
                            type="month"
                            value={editForm.endMonth}
                            onChange={(e) => setEditForm((p) => ({ ...p, endMonth: e.target.value }))}
                            className={loansFormInputClass()}
                            style={loansFormInputStyle()}
                          />
                        ) : (
                          <span className="mt-1 block text-slate-900 dark:text-slate-100">{deduction.endMonth || '—'}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {deduction.type !== 'direct' && (
                    <div className="mt-4">
                      <LoanFormLabel>Monthly amount</LoanFormLabel>
                      {editMode ? (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editForm.monthlyAmount}
                          onChange={(e) => setEditForm((p) => ({ ...p, monthlyAmount: e.target.value }))}
                          className={loansFormInputClass()}
                          style={loansFormInputStyle()}
                        />
                      ) : (
                        <span className={`mt-1 block ${ledgerMoneyClass()}`}>
                          ₹{Number(deduction.monthlyAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4">
                    <LoanFormLabel>Total amount</LoanFormLabel>
                    {editMode ? (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={editForm.totalAmount}
                        onChange={(e) => setEditForm((p) => ({ ...p, totalAmount: e.target.value }))}
                        className={loansFormInputClass()}
                        style={loansFormInputStyle()}
                      />
                    ) : (
                      <span className={`mt-1 block ${ledgerMoneyClass(true)}`}>
                        ₹{Number(deduction.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <LoanFormPanel soft className="!p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Remaining</div>
                      <div className={`mt-1 ${ledgerMoneyClass()}`}>
                        ₹{Number(deduction.remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </LoanFormPanel>
                    <LoanFormPanel soft className="!p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</div>
                      <div className="mt-1">
                        <span className={ledgerStatusBadgeClass(deductionLedgerStatus(deduction.status))}>{getStatusLabel(deduction.status)}</span>
                      </div>
                    </LoanFormPanel>
                  </div>

                  <div className="mt-4">
                    <LoanFormLabel>Reason</LoanFormLabel>
                    {editMode ? (
                      <textarea
                        value={editForm.reason}
                        onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))}
                        rows={2}
                        className={loansFormTextareaClass()}
                        style={loansFormInputStyle()}
                      />
                    ) : (
                      <span className="mt-1 block break-words text-slate-800 dark:text-slate-200">{deduction.reason || '—'}</span>
                    )}
                  </div>

                  {editMode && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className={loansPrimaryButtonClass()}
                        style={loansPrimaryButtonStyle()}
                      >
                        {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save Changes
                      </button>
                    </div>
                  )}
                </LoanDetailSection>

                <LoanDetailSection soft className="!p-4 text-xs">
                    <LoanDetailSectionTitle className="mb-2">Workflow stage</LoanDetailSectionTitle>
                    <div className="mt-3 space-y-2">
                      {[
                        { key: 'pending_hod', label: 'HOD Approval' },
                        { key: 'pending_hr', label: 'HR Approval' },
                        { key: 'pending_admin', label: 'Admin Approval' },
                        { key: 'approved', label: 'Approved' },
                      ].map((step, idx) => {
                        const s = deduction.status;
                        const currentIndex = ['pending_hod', 'pending_hr', 'pending_admin', 'approved'].indexOf(
                          ['partially_settled', 'settled'].includes(s) ? 'approved' : s
                        );
                        const stepIndex = ['pending_hod', 'pending_hr', 'pending_admin', 'approved'].indexOf(step.key);
                        const isDone = currentIndex > -1 && stepIndex < currentIndex && s !== 'rejected';
                        const isCurrent = stepIndex === currentIndex && s !== 'rejected';
                        const isRejected = s === 'rejected';
                        const stepApproval =
                          step.key === 'pending_hod'
                            ? deduction.hodApproval
                            : step.key === 'pending_hr'
                              ? deduction.hrApproval
                              : step.key === 'pending_admin'
                                ? deduction.adminApproval
                                : null;

                        return (
                          <div key={step.key} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
                            <div className="relative">
                              <div
                                className={[
                                  'mt-0.5 h-3.5 w-3.5 rounded-full border-2',
                                  isRejected ? 'border-rose-500 bg-rose-50' : isDone ? 'border-emerald-500 bg-emerald-50' : isCurrent ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
                                ].join(' ')}
                              />
                              {idx < 3 && <div className="mx-auto mt-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-slate-900 dark:text-slate-100">{step.label}</p>
                                {isCurrent && <span className={ledgerStatusBadgeClass('current')}>Current</span>}
                                {isDone && <span className={ledgerStatusBadgeClass('approved')}>Done</span>}
                                {isRejected && <span className={ledgerStatusBadgeClass('rejected')}>Rejected</span>}
                              </div>
                              {stepApproval?.approved != null && (
                                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                  {stepApproval.approved ? 'Approved' : 'Rejected'}
                                  {stepApproval.approvedAt ? ` · ${formatDateTime(stepApproval.approvedAt)}` : ''}
                                  {(stepApproval as any)?.approvedBy?.name ? ` · By: ${(stepApproval as any).approvedBy.name}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                </LoanDetailSection>
              </div>

              {canAct && (
                <LoanDetailSection highlight className="!p-4 space-y-3">
                  <LoanDetailSectionTitle className="mb-0">Actions</LoanDetailSectionTitle>
                  {!isDraft && (
                    <textarea
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                      placeholder="Comment (optional) — e.g. rejection reason"
                      rows={2}
                      className={loansFormTextareaClass()}
                      style={loansFormInputStyle()}
                    />
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleAction(true)}
                      disabled={actionLoading}
                      className={loansDialogSuccessButtonClass()}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {isDraft ? 'Submit for approval' : 'Approve (next level)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(false)}
                      disabled={actionLoading}
                      className={loansDialogDangerButtonClass()}
                    >
                      <XCircle className="h-4 w-4" />
                      {isDraft ? 'Cancel' : 'Reject'}
                    </button>
                  </div>
                </LoanDetailSection>
              )}
            </div>
          ) : (
            <p className="text-stone-500">Failed to load deduction.</p>
          )}
        </LoanDetailDialogBody>
    </LoanDetailDialog>
  );
}

export default function ManualDeductionsPage() {
  return <ManualDeductionsContent />;
}
