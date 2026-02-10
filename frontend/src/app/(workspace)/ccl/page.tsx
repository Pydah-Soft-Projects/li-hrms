'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { PlusIcon, Check, X } from 'lucide-react';
import WorkflowTimeline from '@/components/WorkflowTimeline';

const StatusBadge = ({ status }: { status: string }) => {
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isPending = !isApproved && !isRejected;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isApproved ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
        isRejected ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
        'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-emerald-500' : isRejected ? 'bg-red-500' : 'bg-amber-500'}`} />
      {status}
    </span>
  );
};

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string };
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface CCLRequest {
  _id: string;
  employeeId: Employee;
  emp_no: string;
  date: string;
  isHalfDay: boolean;
  halfDayType?: 'first_half' | 'second_half' | null;
  inTime?: string | null;
  outTime?: string | null;
  totalHours?: number | null;
  attendanceNote?: string | null;
  assignedBy: User;
  purpose: string;
  status: string;
  appliedBy: { name: string; email: string };
  appliedAt: string;
  workflow?: {
    approvalChain: Array<{ stepOrder: number; role: string; label: string; status: string }>;
    nextApproverRole: string;
  };
}

const formatDate = (d: string) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (t: string | Date | null) => {
  if (!t) return '-';
  return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function CCLPage() {
  const { user } = useAuth();
  const currentUser = auth.getUser();

  const isManagement = currentUser && ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser.role);

  const canApplyCCLForSelf = !!currentUser;
  const canApplyCCLForOthers = !!isManagement;

  const [activeTab, setActiveTab] = useState<'my' | 'pending'>('my');
  const [loading, setLoading] = useState(false);
  const [myCCLs, setMyCCLs] = useState<CCLRequest[]>([]);
  const [pendingCCLs, setPendingCCLs] = useState<CCLRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedCCL, setSelectedCCL] = useState<CCLRequest | null>(null);

  const [actionModal, setActionModal] = useState<{ cclId: string; action: 'approve' | 'reject' } | null>(null);
  const [actionComment, setActionComment] = useState('');

  const [employees, setEmployees] = useState<{ _id: string; emp_no: string; employee_name: string }[]>([]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    isHalfDay: false,
    halfDayType: null as 'first_half' | 'second_half' | null,
    assignedBy: '',
    purpose: '',
    empNo: '',
    employeeId: '',
  });
  const [assignedByUsers, setAssignedByUsers] = useState<User[]>([]);
  const [dateValid, setDateValid] = useState<boolean | null>(null);
  const [dateValidationMessage, setDateValidationMessage] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const role = currentUser?.role;
      const isEmployee = role === 'employee';

      if (isEmployee) {
        const [myRes, pendingRes] = await Promise.all([
          api.getMyCCLs(),
          api.getPendingCCLApprovals(),
        ]);
        if (myRes.success) setMyCCLs(myRes.data || []);
        if (pendingRes.success) setPendingCCLs(pendingRes.data || []);
      } else {
        const [cclsRes, pendingRes] = await Promise.all([
          api.getCCLs({ limit: 500 }),
          api.getPendingCCLApprovals(),
        ]);
        if (cclsRes.success) setMyCCLs(cclsRes.data || []);
        if (pendingRes.success) setPendingCCLs(pendingRes.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      if (!currentUser) return;

      if (currentUser.role === 'employee') {
        const identifier = (currentUser as any).emp_no || currentUser.employeeId;
        if (identifier) {
          const r = await api.getEmployee(identifier);
          if (r.success && r.data) setEmployees([r.data]);
          else setEmployees([]);
        } else setEmployees([]);
      } else {
        const query: any = { is_active: true };
        if (currentUser.role === 'hod') {
          const deptId = typeof currentUser.department === 'object' && currentUser.department ? (currentUser.department as any)._id : currentUser.department;
          if (deptId) query.department_id = deptId;
        }
        const r = await api.getEmployees(query);
        if (r.success && Array.isArray(r.data)) setEmployees(r.data || []);
        else setEmployees([]);
      }
    } catch (e) {
      console.error(e);
      setEmployees([]);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (currentUser && showForm) loadEmployees();
  }, [currentUser, showForm]);

  // Resolve employee: selected for on-behalf, or self
  const resolvedEmpNo = formData.empNo || (user as any)?.emp_no || (user as any)?.employeeId;
  const resolvedEmpId = formData.employeeId || (user as any)?.employeeRef;

  useEffect(() => {
    if (!showForm || (!resolvedEmpNo && !resolvedEmpId)) return;
    api.getCCLAssignedByUsers({ employeeId: resolvedEmpId || undefined, empNo: resolvedEmpNo || undefined }).then((r) => {
      if (r.success) setAssignedByUsers(r.data || []);
    });
  }, [showForm, resolvedEmpId, resolvedEmpNo]);

  useEffect(() => {
    if (!formData.date || (!resolvedEmpNo && !resolvedEmpId)) {
      setDateValid(null);
      setDateValidationMessage('');
      return;
    }
    api
      .validateCCLDate(formData.date, {
        employeeId: resolvedEmpId || undefined,
        empNo: resolvedEmpNo || undefined,
        isHalfDay: formData.isHalfDay,
        halfDayType: formData.halfDayType || undefined,
      })
      .then((r: any) => {
        setDateValid(r.valid);
        setDateValidationMessage(r.message || '');
      })
      .catch(() => { setDateValid(false); setDateValidationMessage('Validation failed'); });
  }, [formData.date, formData.isHalfDay, formData.halfDayType, resolvedEmpId, resolvedEmpNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assignedBy || !formData.purpose.trim()) return;
    if (dateValid === false) {
      alert(dateValidationMessage || 'Selected date is not valid. It must be a holiday/week-off and no existing CCL for that day.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.applyCCL({
        date: formData.date,
        isHalfDay: formData.isHalfDay,
        halfDayType: formData.isHalfDay ? formData.halfDayType || undefined : undefined,
        assignedBy: formData.assignedBy,
        purpose: formData.purpose.trim(),
        ...(formData.employeeId ? { employeeId: formData.employeeId } : formData.empNo ? { empNo: formData.empNo } : {}),
      });
      if (res.success) {
        setShowForm(false);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          isHalfDay: false,
          halfDayType: null,
          assignedBy: '',
          purpose: '',
          empNo: '',
          employeeId: '',
        });
        loadData();
      } else {
        alert(res.error || 'Failed to submit');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const canPerformAction = (ccl: CCLRequest) => {
    const u = user as any;
    if (!u?.role) return false;
    const next = ccl.workflow?.nextApproverRole;
    if (!next) return false;
    return next === u.role || (next === 'final_authority' && u.role === 'hr');
  };

  const openActionModal = (id: string, action: 'approve' | 'reject') => {
    setActionModal({ cclId: id, action });
    setActionComment('');
  };

  const handleActionSubmit = async () => {
    if (!actionModal) return;
    setLoading(true);
    try {
      const res = await api.processCCLAction(actionModal.cclId, actionModal.action, actionComment.trim() || undefined);
      if (res.success) {
        setActionModal(null);
        setActionComment('');
        setSelectedCCL(null);
        loadData();
      } else alert(res.error || 'Action failed');
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const list = activeTab === 'my' ? myCCLs : pendingCCLs;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-10">
      <div className="max-w-[1920px] mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Leave &amp; Compensatory</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">CCL (Compensatory Leave)</h1>
          </div>
          {(canApplyCCLForSelf || canApplyCCLForOthers) && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <PlusIcon className="h-4 w-4" /> Apply CCL
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          <button
            onClick={() => setActiveTab('my')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'my'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            }`}
          >
            My CCL
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'pending'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
            }`}
          >
            Pending Approvals {pendingCCLs.length > 0 && `(${pendingCCLs.length})`}
          </button>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
          {loading && list.length === 0 ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 sm:pl-6">Employee</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Date</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Type</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Assigned By</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Purpose</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">Status</th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No CCL requests found</td>
                    </tr>
                  ) : (
                    list.map((ccl) => (
                      <tr
                        key={ccl._id}
                        className="cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        onClick={() => setSelectedCCL(ccl)}
                      >
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                              {(ccl.employeeId?.employee_name || ccl.emp_no).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">{ccl.employeeId?.employee_name || ccl.emp_no}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{ccl.emp_no}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">{formatDate(ccl.date)}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">{ccl.isHalfDay ? `Half (${ccl.halfDayType || '-'})` : 'Full'}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-300">{ccl.assignedBy?.name || '-'}</td>
                        <td className="max-w-[200px] truncate px-3 py-4 text-sm text-gray-600 dark:text-gray-300">{ccl.purpose}</td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <StatusBadge status={ccl.status} />
                        </td>
                        <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right sm:pr-6">
                          {activeTab === 'pending' && canPerformAction(ccl) && (
                            <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => openActionModal(ccl._id, 'approve')}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => openActionModal(ccl._id, 'reject')}
                                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Apply Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Apply CCL</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Compensatory leave for holiday/week-off work</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {canApplyCCLForOthers && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee (on behalf)</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      const emp = employees.find((x) => x._id === val);
                      setFormData((p) => ({ ...p, employeeId: val || '', empNo: emp?.emp_no || '' }));
                    }}
                    className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Self</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>{emp.employee_name} ({emp.emp_no})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                />
                {dateValid !== null && (
                  <p className={`mt-1.5 text-xs ${dateValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {dateValidationMessage || (dateValid ? 'Date is a holiday/week-off' : 'Date is not valid')}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full or half day</label>
                <div className="mt-2 flex gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      checked={!formData.isHalfDay}
                      onChange={() => setFormData((p) => ({ ...p, isHalfDay: false, halfDayType: null }))}
                      className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Full day</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      checked={formData.isHalfDay}
                      onChange={() => setFormData((p) => ({ ...p, isHalfDay: true }))}
                      className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Half day</span>
                  </label>
                </div>
              </div>
              {formData.isHalfDay && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Half (optional)</label>
                  <select
                    value={formData.halfDayType || ''}
                    onChange={(e) => setFormData((p) => ({ ...p, halfDayType: (e.target.value || null) as any }))}
                    className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Select</option>
                    <option value="first_half">First half</option>
                    <option value="second_half">Second half</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Assigned by *</label>
                <select
                  value={formData.assignedBy}
                  onChange={(e) => setFormData((p) => ({ ...p, assignedBy: e.target.value }))}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                >
                  <option value="">Select user</option>
                  {assignedByUsers.map((u) => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose / reason *</label>
                <textarea
                  value={formData.purpose}
                  onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}
                  rows={3}
                  required
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="What did you do on that day?"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-5 dark:border-gray-700">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50">
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedCCL && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={() => setSelectedCCL(null)}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                  {(selectedCCL.employeeId?.employee_name || selectedCCL.emp_no).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">CCL Detail</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCCL.employeeId?.employee_name} ({selectedCCL.emp_no})</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Date</dt><dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatDate(selectedCCL.date)}</dd></div>
                <div><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Type</dt><dd className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{selectedCCL.isHalfDay ? `Half - ${selectedCCL.halfDayType || '-'}` : 'Full'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Assigned by</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{selectedCCL.assignedBy?.name}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Purpose</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{selectedCCL.purpose}</dd></div>
                {selectedCCL.inTime && <div><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">In time</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatTime(selectedCCL.inTime)}</dd></div>}
                {selectedCCL.outTime && <div><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Out time</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatTime(selectedCCL.outTime)}</dd></div>}
                {selectedCCL.totalHours != null && <div><dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Total hours</dt><dd className="mt-1 text-sm text-gray-900 dark:text-white">{selectedCCL.totalHours}h</dd></div>}
              </dl>
              {selectedCCL.attendanceNote && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{selectedCCL.attendanceNote}</p>}
              <div className="flex items-center gap-2"><span className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</span><StatusBadge status={selectedCCL.status} /></div>
            </div>
            {selectedCCL.workflow?.approvalChain?.length ? (
              <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                <WorkflowTimeline workflow={selectedCCL.workflow as any} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              {activeTab === 'pending' && canPerformAction(selectedCCL) && (
                <>
                  <button onClick={() => { setSelectedCCL(null); openActionModal(selectedCCL._id, 'approve'); }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => { setSelectedCCL(null); openActionModal(selectedCCL._id, 'reject'); }} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </>
              )}
              <button onClick={() => setSelectedCCL(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve/Reject Comment Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={() => setActionModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {actionModal.action === 'approve' ? 'Approve CCL' : 'Reject CCL'}
              </h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {actionModal.action === 'approve' ? 'Comments (optional)' : 'Reason (optional)'}
              </label>
              <textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={actionModal.action === 'approve' ? 'Add a comment...' : 'Add a reason...'}
                rows={3}
                autoFocus
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setActionModal(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                  Cancel
                </button>
                <button
                  onClick={handleActionSubmit}
                  disabled={loading}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                    actionModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {loading ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
