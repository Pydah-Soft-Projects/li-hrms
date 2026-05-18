'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import { X, Copy, Calendar, LayoutTemplate, Users } from 'lucide-react';
import { Employee } from '@/lib/api';
import { DeptRosterTemplate } from '@/lib/shiftRoster/rosterCopyUtils';

export type CopyRepeatModalProps = {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  departments: Array<{ _id: string; name: string }>;
  selectedDept: string;
  templates: DeptRosterTemplate[];
  onRefreshTemplates: () => void;
  onCopyFromEmployee: (sourceEmpNo: string, targetEmpNos: string[]) => void;
  onFillFromPreviousCycle: () => void;
  onSaveTemplate: (name: string, departmentId?: string) => void;
  onApplyTemplate: (template: DeptRosterTemplate, targetEmpNos: string[]) => void;
  onDeleteTemplate: (id: string) => void;
  fillPreviousLoading: boolean;
  dirtyCount: number;
  initialSourceEmp?: string | null;
};

const CopyRepeatModal = memo(({
  open,
  onClose,
  employees,
  departments,
  selectedDept,
  templates,
  onRefreshTemplates,
  onCopyFromEmployee,
  onFillFromPreviousCycle,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  fillPreviousLoading,
  dirtyCount,
  initialSourceEmp,
}: CopyRepeatModalProps) => {
  const [tab, setTab] = useState<'copy' | 'previous' | 'template'>('copy');
  const [sourceEmp, setSourceEmp] = useState('');
  const [targetEmps, setTargetEmps] = useState<Set<string>>(new Set());
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => {
    if (open) onRefreshTemplates();
  }, [open, onRefreshTemplates]);

  useEffect(() => {
    if (!open) {
      setSourceEmp('');
      setTargetEmps(new Set());
      setTemplateName('');
      setSelectedTemplateId('');
    } else if (initialSourceEmp) {
      setSourceEmp(initialSourceEmp);
      setTab('copy');
    }
  }, [open, initialSourceEmp]);

  const toggleTarget = (empNo: string) => {
    setTargetEmps((prev) => {
      const next = new Set(prev);
      if (next.has(empNo)) next.delete(empNo);
      else next.add(empNo);
      return next;
    });
  };

  const selectAllTargets = () => {
    setTargetEmps(new Set(employees.map((e) => e.emp_no).filter((no) => no !== sourceEmp)));
  };

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">Copy & Repeat</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Changes stay unsaved until you click Save {dirtyCount > 0 ? `(${dirtyCount} pending)` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-800">
          {[
            { id: 'copy' as const, label: 'Copy row', icon: Users },
            { id: 'previous' as const, label: 'Prev cycle', icon: Calendar },
            { id: 'template' as const, label: 'Templates', icon: LayoutTemplate },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${tab === id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {tab === 'copy' && (
            <>
              <p className="text-[10px] text-slate-500">Copy full roster row from one employee to others on this page.</p>
              <label className="block">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Copy from</span>
                <select
                  value={sourceEmp}
                  onChange={(e) => {
                    setSourceEmp(e.target.value);
                    setTargetEmps((prev) => {
                      const next = new Set(prev);
                      next.delete(e.target.value);
                      return next;
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold"
                >
                  <option value="">Select employee</option>
                  {employees.map((e) => (
                    <option key={e.emp_no} value={e.emp_no}>
                      {e.employee_name || e.emp_no} ({e.emp_no})
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Copy to</span>
                  <button type="button" onClick={selectAllTargets} className="text-[9px] font-black text-indigo-600 uppercase">
                    Select all others
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {employees.filter((e) => e.emp_no !== sourceEmp).map((e) => (
                    <label key={e.emp_no} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <input
                        type="checkbox"
                        checked={targetEmps.has(e.emp_no)}
                        onChange={() => toggleTarget(e.emp_no)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                        {e.employee_name || e.emp_no}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!sourceEmp || targetEmps.size === 0}
                onClick={() => {
                  onCopyFromEmployee(sourceEmp, Array.from(targetEmps));
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Copy size={14} />
                Duplicate roster ({targetEmps.size} staff)
              </button>
            </>
          )}

          {tab === 'previous' && (
            <>
              <p className="text-[10px] text-slate-500">
                Apply last pay cycle&apos;s weekday pattern (Mon→Mon, etc.) to visible employees. Marked as unsaved until Save.
              </p>
              <button
                type="button"
                disabled={fillPreviousLoading}
                onClick={() => {
                  onFillFromPreviousCycle();
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Calendar size={14} />
                {fillPreviousLoading ? 'Loading previous cycle...' : 'Fill current cycle from previous'}
              </button>
            </>
          )}

          {tab === 'template' && (
            <>
              <p className="text-[10px] text-slate-500">
                Save a weekday pattern (from first employee on page) and apply to selected staff.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Production – Standard"
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  disabled={!templateName.trim() || employees.length === 0}
                  onClick={() => {
                    onSaveTemplate(templateName.trim(), selectedDept || undefined);
                    setTemplateName('');
                  }}
                  className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[9px] font-black uppercase shrink-0"
                >
                  Save
                </button>
              </div>
              {templates.length > 0 ? (
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.departmentName ? ` · ${t.departmentName}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-slate-400 italic">No templates saved yet.</p>
              )}
              {selectedTemplate && (
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(selectedTemplate.id)}
                  className="text-[9px] font-black text-red-500 uppercase"
                >
                  Delete template
                </button>
              )}
              <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y">
                {employees.map((e) => (
                  <label key={e.emp_no} className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetEmps.has(e.emp_no)}
                      onChange={() => toggleTarget(e.emp_no)}
                    />
                    <span className="text-[10px] font-semibold truncate">{e.employee_name || e.emp_no}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!selectedTemplate || targetEmps.size === 0}
                onClick={() => {
                  if (selectedTemplate) {
                    onApplyTemplate(selectedTemplate, Array.from(targetEmps));
                    onClose();
                  }
                }}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase disabled:opacity-40"
              >
                Apply template to {targetEmps.size} staff
              </button>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Amber outline on grid = unsaved edit · Save to update database
          </p>
        </div>
      </div>
    </div>
  );
});

CopyRepeatModal.displayName = 'CopyRepeatModal';
export default CopyRepeatModal;
