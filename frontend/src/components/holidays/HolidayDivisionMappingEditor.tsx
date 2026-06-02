'use client';

import { Plus } from 'lucide-react';
import type { Division, Department, EmployeeGroup } from '@/lib/api';
import { filterDepartmentsForDivision } from '@/lib/divisionDepartmentUtils';

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
  employeeGroups?: EmployeeGroup[];
  customEmployeeGroupingEnabled?: boolean;
  /** Limit selectable divisions to these IDs (user holiday scope). Empty = all divisions. */
  allowedDivisionIds?: string[];
  readOnly?: boolean;
  /** When false, only division + department rows (user access scoping). Default true. */
  showEmployeeGroups?: boolean;
  /** Cap mapping rows (e.g. 1 for division manager). */
  maxRows?: number;
  /** Section label override */
  sectionLabel?: string;
  /** When true, division select is HTML-required (holiday create forms). Default false for user admin. */
  requireDivision?: boolean;
};

export function HolidayDivisionMappingEditor({
  mapping,
  onChange,
  divisions,
  departments,
  employeeGroups = [],
  customEmployeeGroupingEnabled = false,
  allowedDivisionIds = [],
  readOnly = false,
  showEmployeeGroups = true,
  maxRows,
  sectionLabel = 'Employee scope',
  requireDivision = false,
}: Props) {
  const visibleDivisions =
    allowedDivisionIds.length > 0
      ? divisions.filter((d) => allowedDivisionIds.includes(d._id))
      : divisions;

  const canAddRow = !readOnly && (maxRows == null || mapping.length < maxRows);

  const addMapping = () => {
    if (!canAddRow) return;
    onChange([...mapping, { division: '', departments: [], employeeGroups: [] }]);
  };

  const removeMapping = (idx: number) => onChange(mapping.filter((_, i) => i !== idx));

  const updateMapping = (idx: number, field: keyof HolidayMappingRow, value: string | string[]) => {
    const next = mapping.length > 0 ? [...mapping] : [{ division: '', departments: [], employeeGroups: [] }];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const departmentsForRow = (divisionId: string) =>
    filterDepartmentsForDivision(divisionId, divisions, departments);

  const displayMapping = mapping.length > 0
    ? mapping
    : requireDivision
      ? [{ division: '', departments: [], employeeGroups: [] }]
      : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{sectionLabel}</p>
        {canAddRow && (maxRows == null || mapping.length === 0) && (
          <button
            type="button"
            onClick={addMapping}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        )}
        {canAddRow && maxRows != null && mapping.length > 0 && mapping.length < maxRows && (
          <button
            type="button"
            onClick={addMapping}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        )}
      </div>
      {displayMapping.length === 0 && !readOnly && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Optional — add a row only if this user should manage holidays for a specific division/department scope.
        </p>
      )}
      {displayMapping.map((m, idx) => (
        <div
          key={idx}
          className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Division{requireDivision ? ' *' : ''}
            </label>
            <select
              value={m.division}
              disabled={readOnly}
              onChange={(e) => {
                const next = [...mapping];
                if (next.length === 0) {
                  onChange([{ division: e.target.value, departments: [], employeeGroups: [] }]);
                  return;
                }
                next[idx] = { division: e.target.value, departments: [], employeeGroups: [] };
                onChange(next);
              }}
              required={requireDivision}
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
                  disabled={readOnly || !m.division}
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
                    const available = departmentsForRow(m.division);
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
              className="w-full h-24 rounded-lg border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white text-sm disabled:opacity-50"
            >
              {departmentsForRow(m.division).map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
            {m.division && departmentsForRow(m.division).length === 0 && (
              <p className="mt-1 text-[10px] text-slate-400">No departments linked to this division</p>
            )}
          </div>
          {showEmployeeGroups && customEmployeeGroupingEnabled && (
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

/** Map user access divisionMapping to editor rows */
export function accessMappingToEditorRows(
  mapping?: { division: string | Division; departments?: (string | Department)[] }[]
): HolidayMappingRow[] {
  const rows = (mapping || [])
    .map((m) => ({
      division: typeof m.division === 'string' ? m.division : String(m.division?._id || ''),
      departments: (m.departments || []).map((d) => (typeof d === 'string' ? d : String(d._id))),
      employeeGroups: [] as string[],
    }))
    .filter((m) => m.division);
  return rows.length > 0 ? rows : [{ division: '', departments: [], employeeGroups: [] }];
}

export function editorRowsToAccessMapping(
  rows: HolidayMappingRow[]
): { division: string; departments: string[] }[] {
  return rows
    .filter((r) => r.division)
    .map(({ division, departments }) => ({
      division,
      departments: departments || [],
    }));
}
