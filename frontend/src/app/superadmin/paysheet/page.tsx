'use client';

import { useState, useEffect } from 'react';
import { api, Department, Division } from '@/lib/api';
import { toast } from 'react-toastify';

function formatCell(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('en-IN');
    return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

export default function PaysheetPage() {
  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');

  useEffect(() => {
    const today = new Date();
    const defaultMonth =
      today.getDate() > 15
        ? today.toISOString().slice(0, 7)
        : new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7);
    setSelectedMonth(defaultMonth);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [divRes, deptRes] = await Promise.all([
          api.getDivisions().catch(() => ({ data: [] })),
          api.getDepartments().catch(() => ({ data: [] })),
        ]);
        setDivisions(Array.isArray(divRes?.data) ? divRes.data : []);
        setDepartments(Array.isArray(deptRes?.data) ? deptRes.data : []);
      } catch (_) {}
    })();
  }, []);

  const loadPaysheet = async () => {
    if (!selectedMonth) {
      toast.warning('Please select a month');
      return;
    }
    setLoading(true);
    try {
      const res = await api.getPaysheetData({
        month: selectedMonth,
        departmentId: selectedDepartment || undefined,
        divisionId: selectedDivision || undefined,
      });
      if (res?.success && res?.data) {
        setHeaders(res.data.headers || []);
        setRows(res.data.rows || []);
        if ((res.data.rows?.length ?? 0) === 0 && res.message) {
          toast.info(res.message);
        } else {
          toast.success(`Loaded ${res.data.rows?.length ?? 0} rows`);
        }
      } else {
        setHeaders([]);
        setRows([]);
        toast.error('Failed to load paysheet');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load paysheet';
      toast.error(msg);
      setHeaders([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50/80 dark:bg-slate-950/50">
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Paysheet
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Table of employees with payroll details calculated using the dynamic payroll configuration (output columns). Headers and formulas match Payroll Configuration; same data as Excel export.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Division
            </label>
            <select
              value={selectedDivision}
              onChange={(e) => {
                setSelectedDivision(e.target.value);
                setSelectedDepartment('');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-w-[180px] focus:ring-2 focus:ring-violet-500"
            >
              <option value="">All divisions</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm min-w-[180px] focus:ring-2 focus:ring-violet-500"
            >
              <option value="">All departments</option>
              {departments
                .filter((d) => {
                  if (!selectedDivision) return true;
                  const div = divisions.find((x) => x._id === selectedDivision);
                  return div?.departments?.some((item) => (typeof item === 'string' ? item : item._id) === d._id);
                })
                .map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            onClick={loadPaysheet}
            disabled={loading || !selectedMonth}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 focus:ring-2 focus:ring-violet-500 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Loading…' : 'Load paysheet'}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {headers.length === 0 && rows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                Select month and click “Load paysheet” to show the table. Columns and formulas come from Payroll Configuration.
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                    {headers.map((h, i) => (
                      <th
                        key={i}
                        className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      {headers.map((header, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap"
                        >
                          {formatCell(row[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
