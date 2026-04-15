'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { api } from '@/lib/api';
import DeductionForm from '@/components/ManualDeductions/DeductionForm';
import Spinner from '@/components/Spinner';
import { Plus, Search, Eye, CheckCircle, Clock, TrendingDown, XCircle, AlertCircle, Users, Loader2, Trash2, Pencil } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, bgClass, iconClass }: { title: string; value: number | string; icon: any; bgClass: string; iconClass: string }) => (
  <div className="rounded-3xl border border-slate-300 bg-slate-50/90 p-6 dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">{title}</p>
    <div className="mt-2 flex items-center gap-3">
      <h3 className="text-3xl font-bold text-slate-950 dark:text-white">{value}</h3>
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bgClass} ${iconClass}`}><Icon className="h-6 w-6" /></div>
    </div>
  </div>
);

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'pending_hod':
    case 'pending_hr':
    case 'pending_admin': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'rejected': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
    case 'partially_settled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'settled': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400';
    default: return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }
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
  employee: { _id: string; emp_no?: string; employee_name?: string; first_name?: string; last_name?: string; leftDate?: string; department_id?: { _id: string; name?: string } | string; division_id?: { _id: string; name?: string } | string };
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
  const [filterDivisionId, setFilterDivisionId] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState('');
  const [filterDesignationId, setFilterDesignationId] = useState('');

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

  const getEntityId = (entity: any) => (typeof entity === 'string' ? entity : entity?._id || '');
  const getEntityName = (entity: any) => {
    if (!entity) return '—';
    if (typeof entity === 'string') return entity;
    return entity.name || entity.title || entity.code || '—';
  };

  const filtered = deductions.filter((d) => {
    const empName = (d.employee?.employee_name || d.employee?.first_name || d.employee?.emp_no || '').toString().toLowerCase();
    const empNo = (d.employee?.emp_no || '').toString().toLowerCase();
    const divName = getEntityName(d.employee?.division_id).toLowerCase();
    const deptName = getEntityName(d.employee?.department_id).toLowerCase();
    const desigName = getEntityName(d.employee?.designation_id).toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || empName.includes(q) || empNo.includes(q) || divName.includes(q) || deptName.includes(q) || desigName.includes(q);
    const matchDivision = !filterDivisionId || getEntityId(d.employee?.division_id) === filterDivisionId;
    const matchDepartment = !filterDepartmentId || getEntityId(d.employee?.department_id) === filterDepartmentId;
    const matchDesignation = !filterDesignationId || getEntityId(d.employee?.designation_id) === filterDesignationId;
    if (!matchSearch) return false;
    if (!matchDivision || !matchDepartment || !matchDesignation) return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return ['pending_hod', 'pending_hr', 'pending_admin'].includes(d.status);
    return d.status === activeTab;
  });

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
    <div className="md:p-8">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mb-10 rounded-2xl border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/30 border border-rose-200">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Manual Deductions</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Deduction from pay — same flow as arrears, applied as deduction</p>
            </div>
          </div>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-xs font-bold uppercase text-white dark:bg-white dark:text-slate-900"
          >
            <Plus className="h-4 w-4" /> Provision Deduction
          </button>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pending Review" value={stats.pending} icon={Clock} bgClass="bg-amber-500/10" iconClass="text-amber-700 dark:text-amber-400" />
        <StatCard title="Approved" value={stats.approved} icon={CheckCircle} bgClass="bg-emerald-500/10" iconClass="text-emerald-700 dark:text-emerald-400" />
        <StatCard title="Settled" value={stats.settled} icon={TrendingDown} bgClass="bg-violet-500/10" iconClass="text-violet-700 dark:text-violet-400" />
        <StatCard title="Rejected" value={stats.rejected} icon={XCircle} bgClass="bg-rose-500/10" iconClass="text-rose-700 dark:text-rose-400" />
      </div>

      {/* Bulk create section */}
      <div className="mb-10 rounded-2xl border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 overflow-hidden">
        <button
          type="button"
          onClick={() => setBulkSectionOpen((o) => !o)}
          className="flex w-full items-center justify-between p-6 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700">
              <Users className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Bulk create requests</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Filter employees, add amount and remarks, then save to create one deduction per row (amount &gt; 0)</p>
            </div>
          </div>
          <span className="text-slate-500">{bulkSectionOpen ? '▼' : '▶'}</span>
        </button>
        {bulkSectionOpen && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pay Period</label>
                <input
                  type="month"
                  value={bulkMonth}
                  onChange={(e) => setBulkMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white px-3 py-2 text-sm min-w-[150px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Division</label>
                <select
                  value={bulkDivisionId}
                  onChange={(e) => { setBulkDivisionId(e.target.value); setBulkDepartmentId(''); }}
                  className="rounded-lg border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white px-3 py-2 text-sm min-w-[180px]"
                >
                  <option value="">All divisions</option>
                  {divisions.map((d: any) => (
                    <option key={d._id} value={d._id}>{d.name || d.code || d._id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Department</label>
                <select
                  value={bulkDepartmentId}
                  onChange={(e) => setBulkDepartmentId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white px-3 py-2 text-sm min-w-[180px]"
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
                className="rounded-xl bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Load employees
              </button>

              {bulkRows.length > 0 && (
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    placeholder="Search loaded employees..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-4 text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700"
                  />
                </div>
              )}
            </div>
            {bulkRows.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-4 py-3 text-left">Employee</th>
                        <th className="px-4 py-3 text-left">Code / Dept</th>
                        <th className="px-4 py-3 text-right w-32">Amount (₹)</th>
                        <th className="px-4 py-3 text-left min-w-[200px]">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredBulkRows.map((row) => {
                        const originalIndex = bulkRows.findIndex(r => r.employee._id === row.employee._id);
                        return (
                          <tr key={row.employee._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-2 font-medium text-slate-950 dark:text-white">
                              <div className="flex flex-col">
                                <span>{row.employee.employee_name || [row.employee.first_name, row.employee.last_name].filter(Boolean).join(' ') || row.employee.emp_no || '—'}</span>
                                {row.employee.leftDate && format(new Date(row.employee.leftDate), 'yyyy-MM') === bulkMonth && (
                                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Left at {format(new Date(row.employee.leftDate), 'yyyy-MM-dd')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                              {row.employee.emp_no || '—'}
                              {(row.employee.department_id as any)?.name && ` / ${(row.employee.department_id as any).name}`}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={row.amount === 0 ? '' : row.amount}
                                onChange={(e) => updateBulkRow(originalIndex, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                                className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5 text-right"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={row.remarks}
                                onChange={(e) => updateBulkRow(originalIndex, 'remarks', e.target.value)}
                                className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5"
                                placeholder="Remarks"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {bulkRows.filter((r) => Number(r.amount) > 0).length} row(s) with amount &gt; 0 will create deduction requests
                  </p>
                  <button
                    type="button"
                    onClick={handleBulkSave}
                    disabled={bulkSaving || bulkRows.every((r) => Number(r.amount) <= 0)}
                    className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 text-sm font-bold uppercase flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save (create requests)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-300 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-100/50 p-6 dark:border-slate-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5 rounded-xl bg-slate-200/80 p-1.5 dark:bg-slate-800/50 overflow-x-auto">
            {['all', 'pending', 'approved', 'settled', 'rejected'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-4 py-2 text-xs font-bold uppercase ${activeTab === tab ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-white shadow' : 'text-slate-600 dark:text-slate-400'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {selectableFiltered.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  disabled={bulkApproving || bulkRejecting || selectedSelectable.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold uppercase disabled:opacity-50 disabled:pointer-events-none"
                  title={selectedSelectable.length === 0 ? 'Select one or more rows below' : `Approve ${selectedSelectable.length} to next level`}
                >
                  {bulkApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve to next level ({selectedSelectable.length})
                </button>
                <button
                  type="button"
                  onClick={handleBulkReject}
                  disabled={bulkApproving || bulkRejecting || selectedSelectable.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-xs font-bold uppercase disabled:opacity-50 disabled:pointer-events-none"
                  title={selectedSelectable.length === 0 ? 'Select one or more rows below' : `Reject ${selectedSelectable.length} selected`}
                >
                  {bulkRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Reject selected ({selectedSelectable.length})
                </button>
                {selectedSelectable.length === 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Select draft or pending row(s), then use Approve / Reject</span>
                )}
              </>
            )}
            <select
              value={filterDivisionId}
              onChange={(e) => setFilterDivisionId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700 min-w-[160px]"
            >
              <option value="">All Divisions</option>
              {divisions.map((d: any) => (
                <option key={d._id} value={d._id}>{d.name || d.code || d._id}</option>
              ))}
            </select>
            <select
              value={filterDepartmentId}
              onChange={(e) => setFilterDepartmentId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700 min-w-[170px]"
            >
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d._id} value={d._id}>{d.name || d.code || d._id}</option>
              ))}
            </select>
            <select
              value={filterDesignationId}
              onChange={(e) => setFilterDesignationId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700 min-w-[170px]"
            >
              <option value="">All Designations</option>
              {designations.map((d: any) => (
                <option key={d._id} value={d._id}>{d.name || d.title || d.code || d._id}</option>
              ))}
            </select>
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search employee / division / dept / designation..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm dark:bg-slate-800 dark:text-white dark:border-slate-700"
              />
            </div>
          </div>
        </div>

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
                <tr className="bg-slate-100 dark:bg-slate-900/50 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
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
                  <th className="px-6 py-4 text-left">Employee</th>
                  <th className="px-6 py-4 text-left">Period / Type</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4 text-right">Remaining</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
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
                      <p className="font-medium text-slate-950 dark:text-white">{getEmployeeName(d.employee)}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{d.employee?.emp_no || '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {getEntityName(d.employee?.division_id)} / {getEntityName(d.employee?.department_id)} / {getEntityName(d.employee?.designation_id)}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">
                      {d.type === 'direct' ? 'Direct' : (d.startMonth && d.endMonth ? `${d.startMonth} – ${d.endMonth}` : '—')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-rose-700 dark:text-rose-400">₹{Number(d.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-sm text-right">₹{Number(d.remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusColor(d.status)}`}>{getStatusLabel(d.status)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setSelectedId(d._id); setDetailOpen(true); }}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-200 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                        {removableStatuses.includes(d.status) && (
                          <button
                            onClick={() => handleRemove(d)}
                            disabled={removingId === d._id}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-100 dark:bg-rose-900/30 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-60"
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
      </div>

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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-50 w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Deduction details</p>
              {deduction ? (
                <>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-black tracking-tight text-slate-950 dark:text-white">{getEmployeeName(deduction.employee)}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {deduction.employee?.emp_no || '—'}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusColor(deduction.status)}`}>
                      {getStatusLabel(deduction.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">
                    {getEntityName(deduction.employee?.division_id)} / {getEntityName(deduction.employee?.department_id)} / {getEntityName(deduction.employee?.designation_id)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                      Amount: ₹{Number(deduction.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Created: {formatDateTime(deduction.createdAt)}</span>
                  </div>
                </>
              ) : (
                <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">Deduction Details</h2>
              )}
            </div>
            <div className="flex items-center gap-2">
              {deduction && canEdit && (
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {deduction && canRemove && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removeLoading}
                  title="Remove deduction"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-300 text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30 disabled:opacity-50"
                >
                  {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">×</button>
            </div>
          </div>
        </div>
        <div className="max-h-[82vh] overflow-y-auto bg-slate-50/70 p-6 dark:bg-slate-950/40">
          {loading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : deduction ? (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Deduction details</h3>
                      <p className="mt-1 text-xs font-black text-slate-950 dark:text-white">
                        {deduction.type === 'direct' ? 'Direct' : 'Incremental'}
                      </p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${getStatusColor(deduction.status)}`}>
                      {getStatusLabel(deduction.status)}
                    </span>
                  </div>

                  {deduction.type !== 'direct' && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">Start month</span>
                        {editMode ? (
                          <input
                            type="month"
                            value={editForm.startMonth}
                            onChange={(e) => setEditForm((p) => ({ ...p, startMonth: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5"
                          />
                        ) : (
                          <span className="mt-1 block text-slate-900 dark:text-slate-100">{deduction.startMonth || '—'}</span>
                        )}
                      </label>
                      <label className="text-xs">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">End month</span>
                        {editMode ? (
                          <input
                            type="month"
                            value={editForm.endMonth}
                            onChange={(e) => setEditForm((p) => ({ ...p, endMonth: e.target.value }))}
                            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5"
                          />
                        ) : (
                          <span className="mt-1 block text-slate-900 dark:text-slate-100">{deduction.endMonth || '—'}</span>
                        )}
                      </label>
                    </div>
                  )}

                  {deduction.type !== 'direct' && (
                    <label className="mt-4 block text-xs">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Monthly amount</span>
                      {editMode ? (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={editForm.monthlyAmount}
                          onChange={(e) => setEditForm((p) => ({ ...p, monthlyAmount: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5"
                        />
                      ) : (
                        <span className="mt-1 block font-bold text-slate-900 dark:text-slate-100">
                          ₹{Number(deduction.monthlyAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </label>
                  )}

                  <label className="mt-4 block text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-400">Total amount</span>
                    {editMode ? (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={editForm.totalAmount}
                        onChange={(e) => setEditForm((p) => ({ ...p, totalAmount: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-2 py-1.5"
                      />
                    ) : (
                      <span className="mt-1 block text-rose-700 dark:text-rose-400 font-black">
                        ₹{Number(deduction.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </label>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                      <div className="font-semibold text-slate-600 dark:text-slate-400">Remaining</div>
                      <div className="mt-1 font-bold text-slate-950 dark:text-white">
                        ₹{Number(deduction.remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                      <div className="font-semibold text-slate-600 dark:text-slate-400">Status</div>
                      <div className="mt-1 font-bold text-slate-950 dark:text-white">{getStatusLabel(deduction.status)}</div>
                    </div>
                  </div>

                  <label className="mt-4 block text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-400">Reason</span>
                    {editMode ? (
                      <textarea
                        value={editForm.reason}
                        onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-3 py-2 resize-none"
                      />
                    ) : (
                      <span className="mt-1 block break-words text-slate-800 dark:text-slate-200">{deduction.reason || '—'}</span>
                    )}
                  </label>

                  {editMode && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-semibold disabled:opacity-50"
                      >
                        {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Workflow stage</h3>
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
                                {isCurrent && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">Current</span>}
                                {isDone && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Done</span>}
                                {isRejected && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">Rejected</span>}
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
                  </div>
                </div>
              </div>

              {canAct && (
                <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Actions</h3>
                  {!isDraft && (
                    <textarea
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                      placeholder="Comment (optional) — e.g. rejection reason"
                      rows={2}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white px-3 py-2 text-sm resize-none"
                    />
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleAction(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {isDraft ? 'Submit for approval' : 'Approve (next level)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(false)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      {isDraft ? 'Cancel' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500">Failed to load deduction.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ManualDeductionsPage() {
  return <ManualDeductionsContent />;
}
