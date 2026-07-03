'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { SettingsPanel, SettingsPanelHeader, SettingsSaveBar, SettingsSectionCard } from './SettingsPageShell';
import {
  DEPT_INPUT,
  DEPT_LABEL,
  settingsInputClass,
  settingsInputStyle,
  settingsPrimaryButtonClass,
  settingsPrimaryButtonStyle,
} from '@/lib/settingsUi';
import { DurationTimeInput, DurationHoursInput } from './DurationTimeInput';
import { OtHourRangesEditor } from './OtHourRangesEditor';
import { minutesToHHMM, hhmmToMinutes } from './otTimeHelpers';

export type DepartmentOtDraft = {
  recognitionMode: string | null;
  thresholdHours: number | null;
  roundUpIfFractionMinutesGte: number | null;
  autoCreateOtRequest: boolean | null;
  otHourRanges: { minMinutes: number; maxMinutes: number; creditedMinutes: number; label?: string }[];
  defaultWorkingHoursPerDay: number | null;
  workingHoursPerDay: number | null;
  allowBackdated: boolean | null;
  maxBackdatedDays: number | null;
  allowFutureDated: boolean | null;
  maxAdvanceDays: number | null;
  groupWorkingHours: { employeeGroupId: string; hoursPerDay: number }[];
};

function emptyDraft(): DepartmentOtDraft {
  return {
    recognitionMode: null,
    thresholdHours: null,
    roundUpIfFractionMinutesGte: null,
    autoCreateOtRequest: null,
    otHourRanges: [],
    defaultWorkingHoursPerDay: null,
    workingHoursPerDay: null,
    allowBackdated: null,
    maxBackdatedDays: null,
    allowFutureDated: null,
    maxAdvanceDays: null,
    groupWorkingHours: [],
  };
}

function draftFromApiOt(ot: Record<string, unknown> | null | undefined): DepartmentOtDraft {
  if (!ot || typeof ot !== 'object') return emptyDraft();
  return {
    recognitionMode: typeof ot.recognitionMode === 'string' ? ot.recognitionMode : null,
    thresholdHours: typeof ot.thresholdHours === 'number' ? ot.thresholdHours : ot.thresholdHours != null ? Number(ot.thresholdHours) : null,
    roundUpIfFractionMinutesGte:
      typeof ot.roundUpIfFractionMinutesGte === 'number'
        ? ot.roundUpIfFractionMinutesGte
        : ot.roundUpIfFractionMinutesGte != null
          ? Number(ot.roundUpIfFractionMinutesGte)
          : null,
    autoCreateOtRequest: typeof ot.autoCreateOtRequest === 'boolean' ? ot.autoCreateOtRequest : null,
    otHourRanges: Array.isArray(ot.otHourRanges) ? (ot.otHourRanges as DepartmentOtDraft['otHourRanges']) : [],
    defaultWorkingHoursPerDay:
      typeof ot.defaultWorkingHoursPerDay === 'number'
        ? ot.defaultWorkingHoursPerDay
        : ot.defaultWorkingHoursPerDay != null
          ? Number(ot.defaultWorkingHoursPerDay)
          : null,
    workingHoursPerDay:
      typeof ot.workingHoursPerDay === 'number' ? ot.workingHoursPerDay : ot.workingHoursPerDay != null ? Number(ot.workingHoursPerDay) : null,
    allowBackdated: typeof ot.allowBackdated === 'boolean' ? ot.allowBackdated : null,
    maxBackdatedDays:
      typeof ot.maxBackdatedDays === 'number' ? ot.maxBackdatedDays : ot.maxBackdatedDays != null ? Number(ot.maxBackdatedDays) : null,
    allowFutureDated: typeof ot.allowFutureDated === 'boolean' ? ot.allowFutureDated : null,
    maxAdvanceDays:
      typeof ot.maxAdvanceDays === 'number' ? ot.maxAdvanceDays : ot.maxAdvanceDays != null ? Number(ot.maxAdvanceDays) : null,
    groupWorkingHours: Array.isArray(ot.groupWorkingHours) ? (ot.groupWorkingHours as DepartmentOtDraft['groupWorkingHours']) : [],
  };
}

function draftToApiPayload(d: DepartmentOtDraft): Record<string, unknown> {
  return {
    recognitionMode: d.recognitionMode,
    thresholdHours: d.thresholdHours,
    roundUpIfFractionMinutesGte: d.roundUpIfFractionMinutesGte,
    autoCreateOtRequest: d.autoCreateOtRequest,
    otHourRanges: d.otHourRanges,
    defaultWorkingHoursPerDay: d.defaultWorkingHoursPerDay,
    workingHoursPerDay: d.workingHoursPerDay,
    allowBackdated: d.allowBackdated,
    maxBackdatedDays: d.maxBackdatedDays,
    allowFutureDated: d.allowFutureDated,
    maxAdvanceDays: d.maxAdvanceDays,
    groupWorkingHours: (d.groupWorkingHours || []).filter((r) => r.employeeGroupId && Number(r.hoursPerDay) > 0),
  };
}

function mergePolicyForSim(org: Record<string, unknown> | null, d: DepartmentOtDraft): Record<string, unknown> {
  const g = org || {};
  const ranges =
    d.otHourRanges && d.otHourRanges.length > 0
      ? d.otHourRanges
      : Array.isArray(g.otHourRanges)
        ? g.otHourRanges
        : [];
  return {
    recognitionMode: d.recognitionMode ?? g.recognitionMode ?? 'none',
    thresholdHours:
      d.thresholdHours !== null && d.thresholdHours !== undefined ? d.thresholdHours : (g.thresholdHours as number | null | undefined) ?? null,
    minOTHours: Number(g.minOTHours ?? 0),
    roundingMinutes: Number(g.roundingMinutes ?? 15),
    roundUpIfFractionMinutesGte:
      d.roundUpIfFractionMinutesGte !== null && d.roundUpIfFractionMinutesGte !== undefined
        ? d.roundUpIfFractionMinutesGte
        : (g.roundUpIfFractionMinutesGte as number | null | undefined) ?? null,
    otHourRanges: ranges,
  };
}

type SimResult = {
  eligible: boolean;
  finalHours: number;
  rawHours: number;
  steps: string[];
  policyUsed: Record<string, unknown>;
};

export default function OTSettingsDepartment({
  departmentId,
  divisionId,
  employeeGroups = [],
  onSaved,
  variant = 'department',
}: {
  departmentId: string;
  divisionId?: string;
  employeeGroups?: { _id: string; name: string }[];
  onSaved?: () => void;
  /** divisionWide: load/save `/departments/settings/division/:id` (defaults for all departments in division) */
  variant?: 'department' | 'divisionWide';
}) {
  const [orgOt, setOrgOt] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<DepartmentOtDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simRawHours, setSimRawHours] = useState('01:22');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [orgRes, deptRes] = await Promise.all([
        api.getOvertimeSettings(),
        variant === 'divisionWide' && divisionId
          ? api.getDivisionWideDepartmentSettings(divisionId)
          : api.getDepartmentSettings(departmentId, divisionId),
      ]);
      if (orgRes.success && orgRes.data) {
        setOrgOt(orgRes.data as Record<string, unknown>);
      } else {
        setOrgOt(null);
      }
      if (deptRes.success && deptRes.data && typeof deptRes.data === 'object') {
        const ot = (deptRes.data as Record<string, unknown>).ot as Record<string, unknown> | undefined;
        setDraft(draftFromApiOt(ot));
      } else {
        setDraft(emptyDraft());
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load OT settings');
    } finally {
      setLoading(false);
    }
  }, [departmentId, divisionId, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveParams = async () => {
    if (variant === 'divisionWide') {
      if (!divisionId) {
        toast.error('Select a division for division-wide OT settings');
        return;
      }
    } else if (!departmentId) {
      toast.error('Missing department');
      return;
    }
    try {
      setSaving(true);
      const res =
        variant === 'divisionWide' && divisionId
          ? await api.updateDivisionWideDepartmentSettings(divisionId, { ot: draftToApiPayload(draft) })
          : await api.updateDepartmentSettings(departmentId, { ot: draftToApiPayload(draft) }, divisionId);
      if (res.success) {
        toast.success(variant === 'divisionWide' ? 'OT parameters saved for this division' : 'OT parameters saved for this department');
        onSaved?.();
        await load();
      } else {
        toast.error((res as { message?: string }).message || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save OT parameters');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulatePolicy = async () => {
    if (variant === 'divisionWide' || !departmentId) {
      toast.error('Simulation needs a specific department; switch off division-wide defaults or pick a department.');
      return;
    }
    const rawMinutes = hhmmToMinutes(simRawHours);
    if (!simRawHours || !/^\d{1,2}:[0-5]\d$/.test(simRawHours) || rawMinutes < 0) {
      toast.error('Enter a valid raw OT duration in HH:MM format');
      return;
    }
    const raw = rawMinutes / 60;
    try {
      setSimLoading(true);
      const policy = mergePolicyForSim(orgOt, draft);
      const res = await api.simulateOtHoursPolicy({
        rawHours: raw,
        departmentId: departmentId || undefined,
        divisionId,
        policy,
      });
      if (!res.success) {
        toast.error((res as { message?: string }).message || 'Simulation failed');
        setSimResult(null);
        return;
      }
      const payload = res as { data?: SimResult };
      setSimResult(payload.data ?? null);
    } catch {
      toast.error('Simulation failed');
      setSimResult(null);
    } finally {
      setSimLoading(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  const setTriBool = (key: 'autoCreateOtRequest' | 'allowBackdated' | 'allowFutureDated', raw: string) => {
    const v = raw === '' ? null : raw === 'true';
    setDraft((prev) => ({ ...prev, [key]: v }));
  };

  const inputClass = settingsInputClass();
  const inputStyle = settingsInputStyle();
  const compactInput = `${inputClass} py-2 text-xs`;
  const compactInputStyle = inputStyle;

  return (
    <SettingsPanel>
      <SettingsPanelHeader section="Overtime" title="Overtime (OT)" subtitle="Department-level OT recognition, hours, and pay basis overrides." />

      <SettingsSectionCard title="Parameters" accent className="lg:sticky lg:top-24">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 border-t border-gray-100 pt-2 dark:border-gray-800 sm:grid-cols-2">
                <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500 sm:col-span-2">Department hours</p>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500">Dept hours/day (x)</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={draft.workingHoursPerDay ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        workingHoursPerDay: e.target.value === '' ? null : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="Inherit"
                    className={compactInput}
                    style={compactInputStyle}
                  />
                </div>
                <div className="space-y-2 border-t border-gray-100 pt-3 sm:col-span-2 dark:border-gray-800">
                  <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">Group hours per day (x)</p>
                  <p className="text-[10px] text-gray-500">Per group in this department; use + Add group row. Unlisted groups use dept hours/day, then default.</p>
                  {employeeGroups.length === 0 && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">No employee groups returned from the server.</p>
                  )}
                  {(draft.groupWorkingHours || []).map((row, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-2">
                      <select
                        value={row.employeeGroupId || ''}
                        onChange={(e) => {
                          const next = [...draft.groupWorkingHours];
                          next[idx] = { ...next[idx], employeeGroupId: e.target.value };
                          setDraft((p) => ({ ...p, groupWorkingHours: next }));
                        }}
                        className={`min-w-[180px] ${DEPT_INPUT}`}
                        style={inputStyle}
                      >
                        <option value="">Select group</option>
                        {employeeGroups.map((g) => (
                          <option key={g._id} value={g._id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        placeholder="h/day"
                        value={row.hoursPerDay ?? ''}
                        onChange={(e) => {
                          const next = [...draft.groupWorkingHours];
                          next[idx] = { ...next[idx], hoursPerDay: e.target.value ? parseFloat(e.target.value) : 0 };
                          setDraft((p) => ({ ...p, groupWorkingHours: next }));
                        }}
                        className={`w-28 ${DEPT_INPUT}`}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            groupWorkingHours: p.groupWorkingHours.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-medium text-indigo-600 hover:underline"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        groupWorkingHours: [...p.groupWorkingHours, { employeeGroupId: '', hoursPerDay: 8 }],
                      }))
                    }
                  >
                    + Add group row
                  </button>
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">Hour rules (automatic)</p>
                <select
                  value={draft.recognitionMode ?? ''}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      recognitionMode: e.target.value === '' ? null : e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-slate-900"
                >
                  <option value="">Inherit organization</option>
                  <option value="none">No threshold</option>
                  <option value="threshold_full">Threshold — full raw hours count once met</option>
                </select>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">Threshold (HH:MM)</span>
                  <DurationHoursInput
                    hours={draft.thresholdHours}
                    onChangeHours={(v) =>
                      setDraft((p) => ({
                        ...p,
                        thresholdHours: v,
                      }))
                    }
                    className="w-28"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">Round up to next hour if frac min ≥</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={draft.roundUpIfFractionMinutesGte ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        roundUpIfFractionMinutesGte: e.target.value === '' ? null : parseInt(e.target.value, 10),
                      }))
                    }
                    placeholder="off"
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs dark:border-gray-700 dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500">Auto-create pending OT when extra hours are detected</span>
                  <select
                    value={draft.autoCreateOtRequest === null || draft.autoCreateOtRequest === undefined ? '' : String(draft.autoCreateOtRequest)}
                    onChange={(e) => setTriBool('autoCreateOtRequest', e.target.value)}
                    className={compactInput}
                    style={compactInputStyle}
                  >
                    <option value="">Inherit organization</option>
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                <div className="space-y-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                  <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">Apply date window</p>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">Allow backdated</span>
                    <select
                      value={draft.allowBackdated === null || draft.allowBackdated === undefined ? '' : String(draft.allowBackdated)}
                      onChange={(e) => setTriBool('allowBackdated', e.target.value)}
                      className={compactInput}
                    style={compactInputStyle}
                    >
                      <option value="">Inherit organization</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-500">Max backdated days</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.maxBackdatedDays ?? ''}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          maxBackdatedDays: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        }))
                      }
                      placeholder="Inherit"
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs dark:border-gray-700 dark:bg-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500">Allow future-dated</span>
                    <select
                      value={draft.allowFutureDated === null || draft.allowFutureDated === undefined ? '' : String(draft.allowFutureDated)}
                      onChange={(e) => setTriBool('allowFutureDated', e.target.value)}
                      className={compactInput}
                    style={compactInputStyle}
                    >
                      <option value="">Inherit organization</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-500">Max advance days</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.maxAdvanceDays ?? ''}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          maxAdvanceDays: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        }))
                      }
                      placeholder="Inherit"
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs dark:border-gray-700 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">OT pay basis</p>
                <p className="text-[10px] text-gray-500">
                  Per hour pay = (employee monthly basic / payroll days) / working hours per day.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-500">Default hours/day</span>
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={draft.defaultWorkingHoursPerDay ?? ''}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        defaultWorkingHoursPerDay: e.target.value === '' ? null : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="Inherit"
                    className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs dark:border-gray-700 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          </SettingsSectionCard>

      <SettingsSectionCard title="OT time ranges" description="Map raw overtime durations to credited hours (24-hour format).">
        <OtHourRangesEditor
          ranges={draft.otHourRanges}
          onChange={(otHourRanges) => setDraft((p) => ({ ...p, otHourRanges }))}
        />
        <div className="mt-4">
          <SettingsSaveBar onSave={handleSaveParams} saving={saving} label="Commit parameters" />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Policy simulator" description="Preview OT recognition for sample extra hours.">
        {variant === 'divisionWide' || !departmentId ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Simulator is available when editing a specific department. Division-wide OT still applies in payroll and OT flows.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className={DEPT_LABEL}>Raw OT (HH:MM)</label>
                <DurationTimeInput
                  value={simRawHours}
                  onChange={setSimRawHours}
                  className={`w-28 ${DEPT_INPUT}`}
                  style={inputStyle}
                />
              </div>
              <button
                type="button"
                onClick={handleSimulatePolicy}
                disabled={simLoading}
                className={settingsPrimaryButtonClass()}
                style={settingsPrimaryButtonStyle()}
              >
                {simLoading ? 'Running…' : 'Run simulation'}
              </button>
            </div>
            {simResult && (
              <div className="mt-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-xs dark:border-gray-800 dark:bg-black/20">
                <p>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Eligible:</span>{' '}
                  {simResult.eligible ? 'yes' : 'no'}
                </p>
                <p>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Final hours:</span>{' '}
                  {minutesToHHMM(Math.round((simResult.finalHours || 0) * 60))} ({simResult.finalHours})
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Steps:</span>{' '}
                  {simResult.steps?.join(' → ') || '—'}
                </p>
              </div>
            )}
          </>
        )}
      </SettingsSectionCard>
    </SettingsPanel>
  );
}
