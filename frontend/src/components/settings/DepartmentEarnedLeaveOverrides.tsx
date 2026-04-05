'use client';

/** Form state for department EL overrides (null / empty = inherit global leave policy). */
export interface DepartmentEarnedLeaveForm {
  enabled: boolean | null;
  /** '' = inherit global */
  earningType: '' | 'attendance_based' | 'fixed';
  useAsPaidInPayroll: boolean | null;
  attendanceRules: {
    minDaysForFirstEL: number | null;
    daysPerEL: number | null;
    maxELPerMonth: number | null;
    maxELPerYear: number | null;
    attendanceRanges: Array<{
      minDays: number;
      maxDays: number;
      elEarned: number;
      description?: string;
    }>;
  };
  fixedRules: {
    elPerMonth: number | null;
    maxELPerYear: number | null;
  };
}

export function defaultEarnedLeaveForm(): DepartmentEarnedLeaveForm {
  return {
    enabled: null,
    earningType: '',
    useAsPaidInPayroll: null,
    attendanceRules: {
      minDaysForFirstEL: null,
      daysPerEL: null,
      maxELPerMonth: null,
      maxELPerYear: null,
      attendanceRanges: [],
    },
    fixedRules: {
      elPerMonth: null,
      maxELPerYear: null,
    },
  };
}

export function mapApiLeavesToEarnedLeaveForm(leaves: any): DepartmentEarnedLeaveForm {
  const el = leaves?.earnedLeave;
  const legacyType = leaves?.elEarningType;
  const t = el?.earningType ?? legacyType;
  const earningType: '' | 'attendance_based' | 'fixed' =
    t === 'attendance_based' || t === 'fixed' ? t : '';
  const ranges = el?.attendanceRules?.attendanceRanges;
  return {
    enabled: typeof el?.enabled === 'boolean' ? el.enabled : null,
    earningType,
    useAsPaidInPayroll: typeof el?.useAsPaidInPayroll === 'boolean' ? el.useAsPaidInPayroll : null,
    attendanceRules: {
      minDaysForFirstEL: el?.attendanceRules?.minDaysForFirstEL ?? null,
      daysPerEL: el?.attendanceRules?.daysPerEL ?? null,
      maxELPerMonth: el?.attendanceRules?.maxELPerMonth ?? null,
      maxELPerYear: el?.attendanceRules?.maxELPerYear ?? null,
      attendanceRanges: Array.isArray(ranges)
        ? ranges.map((r: any) => ({
            minDays: Number(r.minDays) || 0,
            maxDays: Number(r.maxDays) || 0,
            elEarned: Number(r.elEarned) || 0,
            description: r.description || '',
          }))
        : [],
    },
    fixedRules: {
      elPerMonth: el?.fixedRules?.elPerMonth ?? null,
      maxELPerYear: el?.fixedRules?.maxELPerYear ?? null,
    },
  };
}

/** Build `leaves.earnedLeave` payload for PUT /departments/:id/settings (omit inherited fields). */
export function buildEarnedLeaveApiPayload(er: DepartmentEarnedLeaveForm): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (er.enabled !== null) out.enabled = er.enabled;
  if (er.earningType) out.earningType = er.earningType;
  if (er.useAsPaidInPayroll !== null) out.useAsPaidInPayroll = er.useAsPaidInPayroll;

  const arIn = er.attendanceRules;
  const ar: Record<string, unknown> = {};
  (['minDaysForFirstEL', 'daysPerEL', 'maxELPerMonth', 'maxELPerYear'] as const).forEach((k) => {
    const v = arIn[k];
    if (v !== null && v !== undefined && v !== ('' as any)) ar[k] = Number(v);
  });
  if (arIn.attendanceRanges.length > 0) ar.attendanceRanges = arIn.attendanceRanges;

  if (Object.keys(ar).length) out.attendanceRules = ar;

  const fr: Record<string, unknown> = {};
  if (er.fixedRules.elPerMonth !== null && er.fixedRules.elPerMonth !== undefined && er.fixedRules.elPerMonth !== ('' as any)) {
    fr.elPerMonth = Number(er.fixedRules.elPerMonth);
  }
  if (er.fixedRules.maxELPerYear !== null && er.fixedRules.maxELPerYear !== undefined && er.fixedRules.maxELPerYear !== ('' as any)) {
    fr.maxELPerYear = Number(er.fixedRules.maxELPerYear);
  }
  if (Object.keys(fr).length) out.fixedRules = fr;

  return Object.keys(out).length ? out : null;
}

function TriBoolSelect({
  value,
  onChange,
  id,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value === null ? '' : value ? '1' : '0'}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? null : v === '1');
      }}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    >
      <option value="">Use global default</option>
      <option value="1">Yes</option>
      <option value="0">No</option>
    </select>
  );
}

export function DepartmentEarnedLeaveOverridesSection({
  value,
  onChange,
  effectiveEarnedLeave,
  onClearServerOverrides,
  clearingServer,
}: {
  value: DepartmentEarnedLeaveForm;
  onChange: (next: DepartmentEarnedLeaveForm) => void;
  effectiveEarnedLeave?: Record<string, unknown> | null;
  onClearServerOverrides?: () => void | Promise<void>;
  clearingServer?: boolean;
}) {
  const er = value;

  const patch = (partial: Partial<DepartmentEarnedLeaveForm>) => onChange({ ...er, ...partial });
  const patchAr = (partial: Partial<DepartmentEarnedLeaveForm['attendanceRules']>) =>
    onChange({ ...er, attendanceRules: { ...er.attendanceRules, ...partial } });
  const patchFr = (partial: Partial<DepartmentEarnedLeaveForm['fixedRules']>) =>
    onChange({ ...er, fixedRules: { ...er.fixedRules, ...partial } });

  const addRange = () => {
    patchAr({
      attendanceRanges: [
        ...er.attendanceRules.attendanceRanges,
        { minDays: 20, maxDays: 31, elEarned: 1, description: '' },
      ],
    });
  };

  const updateRange = (index: number, field: string, v: string | number) => {
    const next = [...er.attendanceRules.attendanceRanges];
    next[index] = { ...next[index], [field]: v };
    patchAr({ attendanceRanges: next });
  };

  const removeRange = (index: number) => {
    patchAr({
      attendanceRanges: er.attendanceRules.attendanceRanges.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-600">
      <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Earned leave (EL) — department overrides</h3>
      <p className="mb-4 text-[11px] text-slate-500 dark:text-slate-400">
        Overrides merge with the global leave policy. Leave controls on &quot;Use global default&quot; to inherit. Monthly accrual and
        payroll EL-as-paid use the effective settings for this department (and division-specific row, if any).
      </p>

      {effectiveEarnedLeave && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/80 p-3 text-[11px] text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">
          <span className="font-semibold">Effective EL (merged)</span>
          <span className="ml-2 opacity-90">
            enabled: {String((effectiveEarnedLeave as any).enabled)}, type: {(effectiveEarnedLeave as any).earningType}, EL as paid
            in payroll: {String((effectiveEarnedLeave as any).useAsPaidInPayroll)}, max EL/month:{' '}
            {(effectiveEarnedLeave as any).attendanceRules?.maxELPerMonth ?? '—'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">EL enabled</label>
          <TriBoolSelect value={er.enabled} onChange={(v) => patch({ enabled: v })} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">EL earning type</label>
          <select
            value={er.earningType}
            onChange={(e) =>
              patch({ earningType: (e.target.value || '') as '' | 'attendance_based' | 'fixed' })
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Use global default</option>
            <option value="attendance_based">Attendance based</option>
            <option value="fixed">Fixed per month</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Use EL as paid in payroll</label>
          <TriBoolSelect value={er.useAsPaidInPayroll} onChange={(v) => patch({ useAsPaidInPayroll: v })} />
        </div>
      </div>

      {(er.earningType === '' || er.earningType === 'attendance_based') && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Min days for first EL</label>
            <input
              type="number"
              min={1}
              max={31}
              value={er.attendanceRules.minDaysForFirstEL ?? ''}
              onChange={(e) =>
                patchAr({
                  minDaysForFirstEL: e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
              placeholder="Global"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Days per 1 EL</label>
            <input
              type="number"
              min={1}
              max={31}
              value={er.attendanceRules.daysPerEL ?? ''}
              onChange={(e) =>
                patchAr({ daysPerEL: e.target.value === '' ? null : parseInt(e.target.value, 10) })
              }
              placeholder="Global"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Max EL per month</label>
            <input
              type="number"
              min={0}
              max={10}
              value={er.attendanceRules.maxELPerMonth ?? ''}
              onChange={(e) =>
                patchAr({ maxELPerMonth: e.target.value === '' ? null : parseInt(e.target.value, 10) })
              }
              placeholder="Global"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Max EL per year</label>
            <input
              type="number"
              min={0}
              max={365}
              value={er.attendanceRules.maxELPerYear ?? ''}
              onChange={(e) =>
                patchAr({ maxELPerYear: e.target.value === '' ? null : parseInt(e.target.value, 10) })
              }
              placeholder="Global"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      )}

      {(er.earningType === '' || er.earningType === 'attendance_based') && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Custom attendance ranges (optional — replaces global ranges when non-empty)
            </label>
            <button
              type="button"
              onClick={addRange}
              className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
            >
              + Add range
            </button>
          </div>
          {er.attendanceRules.attendanceRanges.length === 0 ? (
            <p className="text-[10px] text-slate-400">No department ranges — global policy ranges apply.</p>
          ) : (
            <div className="space-y-2">
              {er.attendanceRules.attendanceRanges.map((row, index) => (
                <div
                  key={index}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-600"
                >
                  <input
                    type="number"
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                    placeholder="Min"
                    value={row.minDays}
                    onChange={(e) => updateRange(index, 'minDays', parseInt(e.target.value, 10) || 0)}
                  />
                  <input
                    type="number"
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                    placeholder="Max"
                    value={row.maxDays}
                    onChange={(e) => updateRange(index, 'maxDays', parseInt(e.target.value, 10) || 0)}
                  />
                  <input
                    type="number"
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                    placeholder="EL"
                    value={row.elEarned}
                    onChange={(e) => updateRange(index, 'elEarned', parseFloat(e.target.value) || 0)}
                  />
                  <input
                    type="text"
                    className="min-w-[120px] flex-1 rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900"
                    placeholder="Note"
                    value={row.description || ''}
                    onChange={(e) => updateRange(index, 'description', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeRange(index)}
                    className="text-[10px] font-semibold text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(er.earningType === '' || er.earningType === 'fixed') && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Fixed EL per month (unless using paid-leaves count ÷ 12 below)
            </label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={er.fixedRules.elPerMonth ?? ''}
              onChange={(e) =>
                patchFr({ elPerMonth: e.target.value === '' ? null : parseFloat(e.target.value) })
              }
              placeholder="Global / use paid leaves ÷ 12"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              If &quot;Paid leaves count&quot; is set above, fixed EL may use that ÷ 12 instead (existing behaviour).
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Max EL per year (fixed)</label>
            <input
              type="number"
              min={0}
              max={365}
              value={er.fixedRules.maxELPerYear ?? ''}
              onChange={(e) =>
                patchFr({ maxELPerYear: e.target.value === '' ? null : parseInt(e.target.value, 10) })
              }
              placeholder="Global"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(defaultEarnedLeaveForm())}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Reset EL form (inherit global)
        </button>
        {onClearServerOverrides && (
          <button
            type="button"
            disabled={clearingServer}
            onClick={() => onClearServerOverrides()}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {clearingServer ? 'Clearing…' : 'Clear EL overrides on server'}
          </button>
        )}
      </div>
    </div>
  );
}
