'use client';

import { Plus } from 'lucide-react';
import type { Division, Department, EmployeeGroup } from '@/lib/api';

export type HolidayMappingRow = {
  division: string;
  departments: string[];
  employeeGroups: string[];
};

type Props = {
  mapping: HolidayMappingRow[];
  onChange: (rows: HolidayMappingRow[]) => void;
  divisions: Division[];
  departments: Department[];
  employeeGroups: EmployeeGroup[];
  customEmployeeGroupingEnabled: boolean;
  /** Limit selectable divisions to these IDs (user holiday scope). Empty = all divisions. */
  allowedDivisionIds?: string[];
  readOnly?: boolean;
};

export function HolidayDivisionMappingEditor({
  mapping,
  onChange,
  divisions,
  departments,
  employeeGroups,
  customEmployeeGroupingEnabled,
  allowedDivisionIds = [],
  readOnly = false,
}: Props) {
  const visibleDivisions =
    allowedDivisionIds.length > 0
      ? divisions.filter((d) => allowedDivisionIds.includes(d._id))
      : divisions;

  const addMapping = () =>
    onChange([...mapping, { division: '', departments: [], employeeGroups: [] }]);

  const removeMapping = (idx: number) => onChange(mapping.filter((_, i) => i !== idx));

  const updateMapping = (idx: number, field: keyof HolidayMappingRow, value: string | string[]) => {
    const next = [...mapping];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Employee scope</p>
        {!readOnly && (
          <button
            type="button"
            onClick={addMapping}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        )}
      </div>
      {mapping.map((m, idx) => (
        <div
          key={idx}
          className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Division *</label>
            <select
              value={m.division}
              disabled={readOnly}
              onChange={(e) => {
                const next = [...mapping];
                next[idx] = { division: e.target.value, departments: [], employeeGroups: [] };
                onChange(next);
              }}
              required
              className="w-full rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm py-2"
            >
              <option value="">Select division</option>
              {visibleDivisions.map((div) => (
                <option key={div._id} value={div._id}>
                  {div.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Departments</label>
            <div className="flex gap-3 text-xs mb-2">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={m.departments.length === 0}
                  disabled={readOnly}
                  onChange={() => updateMapping(idx, 'departments', [])}
                />
                All departments
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={m.departments.length > 0}
                  disabled={readOnly || !m.division}
                  onChange={() => {
                    const available = departments.filter((dept) =>
                      (dept.divisions || []).some(
                        (div) => (typeof div === 'object' ? div._id : div) === m.division
                      )
                    );
                    if (available[0]) updateMapping(idx, 'departments', [available[0]._id]);
                  }}
                />
                Select specific
              </label>
            </div>
            <select
              multiple
              value={m.departments}
              disabled={readOnly || !m.division || m.departments.length === 0}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions).map((o) => o.value);
                updateMapping(idx, 'departments', values);
              }}
              className="w-full h-20 rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm disabled:opacity-50"
            >
              {departments
                .filter((dept) =>
                  (dept.divisions || []).some(
                    (div) => (typeof div === 'object' ? div._id : div) === m.division
                  )
                )
                .map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
            </select>
          </div>
          {customEmployeeGroupingEnabled && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Employee groups</label>
              <div className="flex gap-3 text-xs mb-2">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={m.employeeGroups.length === 0}
                    disabled={readOnly}
                    onChange={() => updateMapping(idx, 'employeeGroups', [])}
                  />
                  All groups
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={m.employeeGroups.length > 0}
                    disabled={readOnly}
                    onChange={() => {
                      if (employeeGroups[0]) updateMapping(idx, 'employeeGroups', [employeeGroups[0]._id]);
                    }}
                  />
                  Select specific
                </label>
              </div>
              <select
                multiple
                value={m.employeeGroups}
                disabled={readOnly || m.employeeGroups.length === 0}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions).map((o) => o.value);
                  updateMapping(idx, 'employeeGroups', values);
                }}
                className="w-full h-20 rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm disabled:opacity-50"
              >
                {employeeGroups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!readOnly && mapping.length > 1 && (
            <button
              type="button"
              onClick={() => removeMapping(idx)}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Remove row
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function normalizeHolidayMappingFromApi(
  rows?: { division: string | { _id: string }; departments?: (string | { _id: string })[]; employeeGroups?: (string | { _id: string })[] }[]
): HolidayMappingRow[] {
  return (rows || [])
    .map((m) => ({
      division: typeof m.division === 'object' ? m.division._id : m.division,
      departments: (m.departments || []).map((d) => (typeof d === 'object' ? d._id : d)),
      employeeGroups: (m.employeeGroups || []).map((g) => (typeof g === 'object' ? g._id : g)),
    }))
    .filter((m) => m.division);
}
