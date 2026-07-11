'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api, Division, Department, Designation, Employee, EmployeeGroup } from '@/lib/api';
import { getDepartmentsForDivision } from '@/lib/divisionDepartmentUtils';

export interface RejoinFormData {
  doj: string;
  proposedSalary: number;
  rejoinRemarks: string;
  phone_number: string;
  alt_phone_number: string;
  email: string;
  address: string;
  location: string;
  division_id: string;
  department_id: string;
  designation_id: string;
  employee_group_id: string;
  pf_number: string;
  esi_number: string;
  bank_account_no: string;
  bank_name: string;
  bank_place: string;
  ifsc_code: string;
  salary_mode: 'Bank' | 'Cash';
}

interface RejoinEmployeeModalProps {
  employee: Employee | { emp_no: string; employee_name?: string };
  divisions: Division[];
  departments: Department[];
  designations: Designation[];
  employeeGroups?: EmployeeGroup[];
  onClose: () => void;
  onSuccess?: (message?: string) => void;
}

function refId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in value) {
    return String((value as { _id: string })._id);
  }
  return String(value);
}

function toDateInput(value?: string | Date | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

export default function RejoinEmployeeModal({
  employee: initialEmployee,
  divisions,
  departments,
  designations,
  employeeGroups = [],
  onClose,
  onSuccess,
}: RejoinEmployeeModalProps) {
  const [employee, setEmployee] = useState<Employee | null>(
    'phone_number' in initialEmployee ? (initialEmployee as Employee) : null
  );
  const [loadingEmployee, setLoadingEmployee] = useState(!('phone_number' in initialEmployee));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<RejoinFormData>({
    doj: new Date().toISOString().split('T')[0],
    proposedSalary: 0,
    rejoinRemarks: '',
    phone_number: '',
    alt_phone_number: '',
    email: '',
    address: '',
    location: '',
    division_id: '',
    department_id: '',
    designation_id: '',
    employee_group_id: '',
    pf_number: '',
    esi_number: '',
    bank_account_no: '',
    bank_name: '',
    bank_place: '',
    ifsc_code: '',
    salary_mode: 'Bank',
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if ('phone_number' in initialEmployee && initialEmployee.emp_no) {
        setEmployee(initialEmployee as Employee);
        setLoadingEmployee(false);
        return;
      }
      setLoadingEmployee(true);
      try {
        const res = await api.getEmployee(initialEmployee.emp_no);
        if (!cancelled && res?.success && res.data) {
          setEmployee(res.data as Employee);
        } else if (!cancelled) {
          setError(res?.message || 'Failed to load employee details');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load employee');
      } finally {
        if (!cancelled) setLoadingEmployee(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [initialEmployee]);

  useEffect(() => {
    if (!employee) return;
    setForm({
      doj: new Date().toISOString().split('T')[0],
      proposedSalary: Number(employee.gross_salary) || 0,
      rejoinRemarks: '',
      phone_number: employee.phone_number || '',
      alt_phone_number: employee.alt_phone_number || '',
      email: employee.email || '',
      address: employee.address || '',
      location: employee.location || '',
      division_id: refId(employee.division_id),
      department_id: refId(employee.department_id),
      designation_id: refId(employee.designation_id),
      employee_group_id: refId(employee.employee_group_id),
      pf_number: employee.pf_number || '',
      esi_number: employee.esi_number || '',
      bank_account_no: employee.bank_account_no || '',
      bank_name: employee.bank_name || '',
      bank_place: employee.bank_place || '',
      ifsc_code: employee.ifsc_code || '',
      salary_mode: employee.salary_mode || 'Bank',
    });
  }, [employee]);

  const filteredDepartments = useMemo(
    () =>
      form.division_id
        ? getDepartmentsForDivision(form.division_id, divisions, departments ?? [])
        : [],
    [divisions, departments, form.division_id]
  );

  const filteredDesignations = useMemo(() => {
    const desList = designations ?? [];
    if (!form.department_id) return desList;
    return desList.filter(
      (d) => !d.department || refId(d.department) === form.department_id
    );
  }, [designations, form.department_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setError('');

    if (!form.doj) {
      setError('Rejoin date is required');
      return;
    }
    if (!form.proposedSalary || form.proposedSalary <= 0) {
      setError('Valid proposed salary is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        emp_no: employee.emp_no,
        doj: form.doj,
        proposedSalary: form.proposedSalary,
        rejoinRemarks: form.rejoinRemarks || undefined,
        phone_number: form.phone_number || undefined,
        alt_phone_number: form.alt_phone_number || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        location: form.location || undefined,
        division_id: form.division_id || undefined,
        department_id: form.department_id || undefined,
        designation_id: form.designation_id || undefined,
        employee_group_id: form.employee_group_id || undefined,
        pf_number: form.pf_number || undefined,
        esi_number: form.esi_number || undefined,
        bank_account_no: form.bank_account_no || undefined,
        bank_name: form.bank_name || undefined,
        bank_place: form.bank_place || undefined,
        ifsc_code: form.ifsc_code || undefined,
        salary_mode: form.salary_mode,
      };

      const res = await api.createRejoinApplication(payload);
      if (res.success) {
        onSuccess?.(res.message || 'Rejoin application submitted. Pending verification.');
        onClose();
      } else {
        setError(res.message || 'Failed to submit rejoin application');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = employee?.employee_name || initialEmployee.employee_name || initialEmployee.emp_no;
  const tenures = employee?.employmentTenures || [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[61] flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Rejoin
              </div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Rejoin Employee
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {displayName} ({initialEmployee.emp_no}) — submits to verification &amp; salary approval
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:text-red-500 dark:border-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingEmployee ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading employee details…</div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {employee && (
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="font-medium text-slate-700 dark:text-slate-300">Identity (locked)</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>Name: <strong className="text-slate-900 dark:text-white">{employee.employee_name}</strong></span>
                    <span>Emp No: <strong className="text-slate-900 dark:text-white">{employee.emp_no}</strong></span>
                    <span>Original DOJ: <strong>{toDateInput(employee.doj) || '—'}</strong></span>
                    <span>Left: <strong>{toDateInput(employee.leftDate) || '—'}</strong></span>
                  </div>
                  {tenures.length > 0 && (
                    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employment history</p>
                      <ul className="mt-2 space-y-1.5">
                        {tenures.map((t: any, i: number) => (
                          <li key={i} className="text-xs text-slate-600 dark:text-slate-400">
                            #{i + 1}: Joined {toDateInput(t.joinDate) || '—'}
                            {t.leaveDate ? ` → Left ${toDateInput(t.leaveDate)}` : ' → Active'}
                            {t.leaveReason ? ` (${t.leaveReason})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <form id="rejoin-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Rejoin date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={form.doj}
                      onChange={(e) => setForm((f) => ({ ...f, doj: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Proposed salary <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={form.proposedSalary || ''}
                      onChange={(e) => setForm((f) => ({ ...f, proposedSalary: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Remarks</label>
                  <textarea
                    rows={2}
                    value={form.rejoinRemarks}
                    onChange={(e) => setForm((f) => ({ ...f, rejoinRemarks: e.target.value }))}
                    placeholder="Reason for rejoin, notes for approvers…"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>

                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Org &amp; contact (editable)</p>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Division</label>
                    <select
                      value={form.division_id}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          division_id: e.target.value,
                          department_id: '',
                          designation_id: '',
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Select division</option>
                      {divisions.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
                    <select
                      value={form.department_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, department_id: e.target.value, designation_id: '' }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Select department</option>
                      {filteredDepartments.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
                    <select
                      value={form.designation_id}
                      onChange={(e) => setForm((f) => ({ ...f, designation_id: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">Select designation</option>
                      {filteredDesignations.map((d) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  {employeeGroups.length > 0 && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee group</label>
                      <select
                        value={form.employee_group_id}
                        onChange={(e) => setForm((f) => ({ ...f, employee_group_id: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="">Select group</option>
                        {employeeGroups.map((g) => (
                          <option key={g._id} value={g._id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
                    <input
                      type="tel"
                      value={form.phone_number}
                      onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Alt. phone</label>
                    <input
                      type="tel"
                      value={form.alt_phone_number}
                      onChange={(e) => setForm((f) => ({ ...f, alt_phone_number: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-emerald-300 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="rejoin-form"
            disabled={submitting || loadingEmployee || !employee}
            className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit rejoin request'}
          </button>
        </div>
      </div>
    </div>
  );
}
