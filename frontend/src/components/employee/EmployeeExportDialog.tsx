'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { Calendar } from 'lucide-react';

interface EmployeeExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  filters?: any;
  empNo?: string;
  employeeName?: string;
}

export default function EmployeeExportDialog({
  isOpen,
  onClose,
  filters,
  empNo,
  employeeName
}: EmployeeExportDialogProps) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [dojStartDate, setDojStartDate] = useState<string>('');
  const [dojEndDate, setDojEndDate] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setDojStartDate(filters?.doj_start || '');
      setDojEndDate(filters?.doj_end || '');
      loadSettings();
    }
  }, [isOpen, filters]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getEmployeeFormSettings();
      if (res.success && res.data) {
        setGroups(res.data.groups || []);
        // Default select some important fields
        const defaultFields = ['emp_no', 'employee_name', 'division_id', 'department_id', 'designation_id', 'employee_group_id', 'doj'];
        setSelectedFields(defaultFields);
      }
    } catch (error) {
      console.error('Failed to load form settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const toggleGroup = (groupId: string, fields: any[]) => {
    const fieldIds = fields.map(f => f.id);
    const allSelected = fieldIds.every(id => selectedFields.includes(id));

    if (allSelected) {
      setSelectedFields(prev => prev.filter(id => !fieldIds.includes(id)));
    } else {
      setSelectedFields(prev => [...new Set([...prev, ...fieldIds])]);
    }
  };

  const handleSelectAll = () => {
    const allFieldIds: string[] = [];
    groups.forEach(g =>
      (g.fields || []).forEach((f: any) => {
        if (f?.id && f.isEnabled !== false) allFieldIds.push(f.id);
      })
    );
    // Add common fields
    allFieldIds.push('emp_no', 'employee_name', 'division_id', 'department_id', 'designation_id', 'employee_group_id', 'doj', 'is_active', 'leftDate', 'leftReason');
    setSelectedFields([...new Set(allFieldIds)]);
  };

  const handleClearAll = () => {
    setSelectedFields([]);
  };

  const handleExport = async (format: 'xlsx' | 'csv' = 'xlsx') => {
    if (selectedFields.length === 0) {
      alert('Please select at least one field to export');
      return;
    }

    setExporting(true);
    try {
      const activeFilters = {
        ...filters,
        doj_start: dojStartDate || undefined,
        doj_end: dojEndDate || undefined,
      };
      const blob = await api.exportEmployees(selectedFields, activeFilters, empNo, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      a.download = empNo ? `employee_${empNo}_export.${ext}` : `employees_export_${new Date().toISOString().split('T')[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    } catch (error: any) {
      console.error('Export failed:', error);
      alert(error.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[70] flex h-full max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-3">
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {empNo ? `Download Data: ${employeeName || empNo}` : 'Download Employee Data'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Select the fields you want to include in the Excel / CSV export.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* DOJ Period Filter Section */}
        {!empNo && (
          <div className="mx-6 mb-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
                  Select DOJ (Date of Joining) Period
                </span>
                {(dojStartDate || dojEndDate) && (
                  <span className="ml-1 inline-flex items-center rounded-md bg-indigo-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white tracking-widest">
                    Filtered
                  </span>
                )}
              </div>
              {(dojStartDate || dojEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setDojStartDate('');
                    setDojEndDate('');
                  }}
                  className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 dark:text-rose-400 transition"
                >
                  Clear Period
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  DOJ From (Start Date)
                </label>
                <input
                  type="date"
                  value={dojStartDate}
                  onChange={(e) => setDojStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  DOJ To (End Date)
                </label>
                <input
                  type="date"
                  value={dojEndDate}
                  onChange={(e) => setDojEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 text-[10px] font-medium mr-0.5">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  setDojStartDate(`${y}-01-01`);
                  setDojEndDate(`${y}-12-31`);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                This Year
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date().getFullYear() - 1;
                  setDojStartDate(`${y}-01-01`);
                  setDojEndDate(`${y}-12-31`);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Last Year
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const m = String(now.getMonth() + 1).padStart(2, '0');
                  const y = now.getFullYear();
                  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
                  setDojStartDate(`${y}-${m}-01`);
                  setDojEndDate(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const d = new Date();
                  d.setDate(d.getDate() - 30);
                  setDojStartDate(d.toISOString().slice(0, 10));
                  setDojEndDate(now.toISOString().slice(0, 10));
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const d = new Date();
                  d.setDate(d.getDate() - 90);
                  setDojStartDate(d.toISOString().slice(0, 10));
                  setDojEndDate(now.toISOString().slice(0, 10));
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Last 90 Days
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex gap-4 px-6 pb-4">
          <button
            onClick={handleSelectAll}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="text-xs font-semibold text-slate-500 hover:text-slate-600 dark:text-slate-400"
          >
            Clear All
          </button>
          <div className="ml-auto text-xs text-slate-400">
            {selectedFields.length} fields selected
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {/* Common Fields Group */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Core Information</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { id: 'emp_no', label: 'Employee No' },
                    { id: 'employee_name', label: 'Employee Name' },
                    { id: 'division_id', label: 'Division' },
                    { id: 'department_id', label: 'Department' },
                    { id: 'designation_id', label: 'Designation' },
                    { id: 'employee_group_id', label: 'Employee Group' },
                    { id: 'doj', label: 'Joining Date' },
                    { id: 'is_active', label: 'Status' },
                  ].map(field => (
                    <label key={field.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-1 hover:bg-white dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Groups */}
              {groups.map(group => {
                const enabledFields = (group.fields || []).filter((f: any) => f && f.id && f.isEnabled !== false);
                if (enabledFields.length === 0) return null;

                const getExportFieldLabel = (field: any) => {
                  // On employees, proposedSalary is the gross salary field
                  if (field.id === 'proposedSalary') {
                    const grossLabel = groups
                      .flatMap((g: any) => g.fields || [])
                      .find((f: any) => f?.id === 'gross_salary')?.label;
                    return grossLabel || 'Gross Salary';
                  }
                  return field.label || field.id;
                };

                return (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{group.label}</h4>
                    <button
                      onClick={() => toggleGroup(group.id, enabledFields)}
                      className="text-[10px] font-bold text-indigo-500 hover:underline"
                    >
                      {enabledFields.every((f: any) => selectedFields.includes(f.id)) ? 'Deselect Group' : 'Select Group'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {enabledFields.map((field: any) => (
                      <label key={field.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-1 hover:bg-slate-50 dark:hover:bg-slate-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedFields.includes(field.id)}
                          onChange={() => toggleField(field.id)}
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-400">{getExportFieldLabel(field)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-6 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          >
            Cancel
          </button>
          <div className="flex-1 flex gap-2 justify-end">
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting || loading || selectedFields.length === 0}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {exporting ? 'Exporting...' : 'Download CSV'}
            </button>
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting || loading || selectedFields.length === 0}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 dark:shadow-none"
            >
              {exporting ? 'Exporting...' : 'Download Excel (.xlsx)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
