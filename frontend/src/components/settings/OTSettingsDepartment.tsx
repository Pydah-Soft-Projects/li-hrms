'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import { Save, Clock, ChevronRight } from 'lucide-react';
import { minutesToHHMM, hhmmToMinutes, hoursToHHMM, hhmmToHours } from './otTimeHelpers';

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
}: {
  departmentId: string;
  divisionId?: string;
  employeeGroups?: { _id: string; name: string }[];
  onSaved?: () => void;
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
        api.getDepartmentSettings(departmentId, divisionId),
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
  }, [departmentId, divisionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveParams = async () => {
    try {
      setSaving(true);
      const res = await api.updateDepartmentSettings(departmentId, { ot: draftToApiPayload(draft) }, divisionId);
      if (res.success) {
        toast.success('OT parameters saved for this department');
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
        departmentId,
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between border-b border-gray-200 pb-5 dark:border-gray-800">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
            <span>Settings</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-indigo-600">Overtime</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Overtime (OT)</h2>
        </div>
      </div>

      <div className="max-w-5xl">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#1E293B] lg:sticky lg:top-24">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-800/50 dark:bg-indigo-900/30 dark:text-indigo-400">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Parameters</h3>
            </div>

            <div className="space-y-6 p-5">
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
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-slate-900"
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
                        className="min-w-[180px] rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-slate-900 dark:text-white"
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
                        className="w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-slate-900 dark:text-white"
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
                  <input
                    type="time"
                    step={60}
                    value={hoursToHHMM(draft.thresholdHours)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        thresholdHours: hhmmToHours(e.target.value),
                      }))
                    }
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs dark:border-gray-700 dark:bg-slate-900"
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
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-slate-900"
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
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-slate-900"
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
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs dark:border-gray-700 dark:bg-slate-900"
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
                <p className="pt-2 text-[10px] font-bold uppercase tracking-tighter text-gray-500">Ranges (HH:MM)</p>
                <p className="text-[10px] text-gray-500">Example: 00:30 to 01:00 consider as 01:00</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-9 gap-2 px-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                    <span className="col-span-2">From</span>
                    <span className="col-span-1 text-center">-</span>
                    <span className="col-span-2">To</span>
                    <span className="col-span-1 text-center">=</span>
                    <span className="col-span-2">Consider As</span>
                    <span className="col-span-1 text-right">Action</span>
                  </div>
                  {draft.otHourRanges.map((r, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-9 items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2 dark:border-gray-800 dark:bg-slate-900/30"
                    >
                      <input
                        type="time"
                        step={60}
                        value={minutesToHHMM(r.minMinutes)}
                        onChange={(e) => {
                          const next = [...draft.otHourRanges];
                          next[idx] = { ...next[idx], minMinutes: hhmmToMinutes(e.target.value) };
                          setDraft((p) => ({ ...p, otHourRanges: next }));
                        }}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-slate-900"
                      />
                      <span className="text-center text-[10px] text-gray-500">to</span>
                      <input
                        type="time"
                        step={60}
                        value={minutesToHHMM(r.maxMinutes)}
                        onChange={(e) => {
                          const next = [...draft.otHourRanges];
                          next[idx] = { ...next[idx], maxMinutes: hhmmToMinutes(e.target.value) };
                          setDraft((p) => ({ ...p, otHourRanges: next }));
                        }}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-slate-900"
                      />
                      <span className="text-center text-[10px] text-gray-500">consider</span>
                      <input
                        type="time"
                        step={60}
                        value={minutesToHHMM(r.creditedMinutes)}
                        onChange={(e) => {
                          const next = [...draft.otHourRanges];
                          next[idx] = { ...next[idx], creditedMinutes: hhmmToMinutes(e.target.value) };
                          setDraft((p) => ({ ...p, otHourRanges: next }));
                        }}
                        className="col-span-2 rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            otHourRanges: p.otHourRanges.filter((_, i) => i !== idx),
                          }))
                        }
                        className="col-span-1 text-right text-[10px] font-bold text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        otHourRanges: [...p.otHourRanges, { minMinutes: 0, maxMinutes: 0, creditedMinutes: 0, label: '' }],
                      }))
                    }
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    + Add range
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveParams}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
              >
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Commit Parameters
              </button>
            </div>
          </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-[#1E293B] sm:p-8">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">Policy simulator</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Raw OT (HH:MM)</label>
            <input
              type="time"
              step={60}
              value={simRawHours}
              onChange={(e) => setSimRawHours(e.target.value)}
              className="w-28 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="button"
            onClick={handleSimulatePolicy}
            disabled={simLoading}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-slate-600"
          >
            {simLoading ? 'Running…' : 'Run simulation'}
          </button>
        </div>
        {simResult && (
          <div className="mt-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-xs dark:border-gray-800 dark:bg-black/20">
            <p>
              <span className="font-semibold text-gray-700 dark:text-gray-300">Eligible:</span> {simResult.eligible ? 'yes' : 'no'}
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
      </section>
    </div>
  );
}
