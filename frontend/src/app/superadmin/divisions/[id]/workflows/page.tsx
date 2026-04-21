'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiRequest, DivisionWorkflowModuleKey, DivisionWorkflowSettings } from '@/lib/api';
import WorkflowManager, { WorkflowData } from '@/components/settings/shared/WorkflowManager';
import Spinner from '@/components/Spinner';
import { GitBranch, ArrowLeft } from 'lucide-react';

const MODULES: { key: DivisionWorkflowModuleKey; label: string; description: string }[] = [
  { key: 'leave', label: 'Leave', description: 'Leave applications' },
  { key: 'od', label: 'On duty (OD)', description: 'OD requests' },
  { key: 'ccl', label: 'CCL', description: 'Compensatory casual leave' },
  { key: 'loan', label: 'Loan', description: 'Loan applications' },
  { key: 'salary_advance', label: 'Salary advance', description: 'Salary advance applications' },
  { key: 'permission', label: 'Permission', description: 'Mid-shift / edge permissions' },
  { key: 'ot', label: 'Overtime (OT)', description: 'OT approval chain' },
];

function toWorkflowData(raw: Record<string, unknown> | null | undefined): WorkflowData {
  if (!raw || typeof raw !== 'object') {
    return {
      isEnabled: true,
      steps: [],
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
      allowHigherAuthorityToApproveLowerLevels: false,
    };
  }
  const stepsIn = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = stepsIn.map((s: Record<string, unknown>, i: number) => ({
    stepOrder: typeof s.stepOrder === 'number' ? s.stepOrder : i + 1,
    stepName: String(s.stepName || ''),
    approverRole: String(s.approverRole || 'hod'),
    isActive: s.isActive !== false,
    canEditLWD: s.canEditLWD as boolean | undefined,
  }));
  const fa = raw.finalAuthority as { role?: string; anyHRCanApprove?: boolean } | undefined;
  return {
    isEnabled: raw.isEnabled !== false,
    steps,
    finalAuthority: {
      role: fa?.role || 'hr',
      anyHRCanApprove: fa?.anyHRCanApprove !== false,
    },
    allowHigherAuthorityToApproveLowerLevels: !!raw.allowHigherAuthorityToApproveLowerLevels,
  };
}

/** Merge UI-edited steps back onto stored workflow objects so we keep loan/OD extra fields where present. */
function mergeWorkflowSave(
  previous: Record<string, unknown> | null | undefined,
  ui: WorkflowData
): Record<string, unknown> {
  const base = previous && typeof previous === 'object' ? { ...previous } : {};
  const prevSteps = Array.isArray(base.steps) ? (base.steps as Record<string, unknown>[]) : [];
  const nextSteps = ui.steps.map((step, idx) => {
    const old = prevSteps[idx] && typeof prevSteps[idx] === 'object' ? { ...prevSteps[idx] } : {};
    return {
      ...old,
      stepOrder: step.stepOrder ?? idx + 1,
      stepName: step.stepName,
      approverRole: step.approverRole,
      isActive: step.isActive !== false,
    };
  });
  return {
    ...base,
    isEnabled: ui.isEnabled,
    steps: nextSteps,
    finalAuthority: {
      ...(typeof base.finalAuthority === 'object' && base.finalAuthority !== null ? (base.finalAuthority as object) : {}),
      role: ui.finalAuthority?.role || 'hr',
      anyHRCanApprove: ui.finalAuthority?.anyHRCanApprove !== false,
    },
    allowHigherAuthorityToApproveLowerLevels: ui.allowHigherAuthorityToApproveLowerLevels ?? false,
  };
}

export default function DivisionWorkflowsPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [divisionName, setDivisionName] = useState<string>('');
  const [tab, setTab] = useState<DivisionWorkflowModuleKey>('leave');
  const [rawByModule, setRawByModule] = useState<Partial<Record<DivisionWorkflowModuleKey, Record<string, unknown> | null>>>({});
  const [draft, setDraft] = useState<WorkflowData>(() => toWorkflowData(undefined));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await apiRequest<DivisionWorkflowSettings>(`/divisions/${id}/workflow-settings`, {
      method: 'GET',
    });
    if (!res.success || !res.data) {
      setError(res.message || res.error || 'Failed to load');
      setLoading(false);
      return;
    }
    const div = res.data.division;
    setDivisionName(typeof div === 'object' && div !== null && 'name' in div ? String((div as { name?: string }).name || '') : '');
    const wfs = res.data.workflows || {};
    setRawByModule(wfs as typeof rawByModule);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const raw = rawByModule[tab];
    setDraft(toWorkflowData(raw === null ? undefined : raw || undefined));
  }, [tab, rawByModule]);

  const persist = async (workflows: Partial<Record<DivisionWorkflowModuleKey, Record<string, unknown> | null>>) => {
    setSaving(true);
    setError(null);
    const res = await apiRequest<DivisionWorkflowSettings>(`/divisions/${id}/workflow-settings`, {
      method: 'PUT',
      body: JSON.stringify({ workflows }),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.message || res.error || 'Save failed');
      return;
    }
    setRawByModule((res.data.workflows || {}) as typeof rawByModule);
  };

  const handleSave = async () => {
    const merged = mergeWorkflowSave(rawByModule[tab] ?? undefined, draft);
    await persist({ [tab]: merged });
  };

  const handleClear = async () => {
    if (!confirm('Remove this division’s workflow override for this module? Global settings will apply.')) return;
    await persist({ [tab]: null });
  };

  const hasOverride = rawByModule[tab] != null;

  if (!id) {
    return <div className="p-8 text-slate-600">Invalid division.</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/superadmin/divisions"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Divisions
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <GitBranch className="h-7 w-7 text-violet-600" />
              Division workflows
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {divisionName ? (
                <>
                  <span className="font-semibold text-slate-800">{divisionName}</span> — override approval chains per module. Empty
                  override inherits{' '}
                  <span className="font-medium">global</span> settings (not department settings).
                </>
              ) : (
                'Configure workflows at division level; if not set, global defaults apply.'
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setTab(m.key)}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                tab === m.key
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {m.label}
              {rawByModule[m.key] != null && <span className="ml-1 text-[10px] opacity-80">●</span>}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">{MODULES.find((x) => x.key === tab)?.label}</h2>
            <p className="text-sm text-slate-500">{MODULES.find((x) => x.key === tab)?.description}</p>
            <p className="mt-2 text-xs text-slate-500">
              {hasOverride ? (
                <span className="text-violet-700">This division has a custom workflow for this module.</span>
              ) : (
                <span>Inheriting organization-wide workflow. Add steps below and save to create an override.</span>
              )}
            </p>
          </div>

          <WorkflowManager workflow={draft} onChange={setDraft} title="Approval chain" description="Matches global workflow shape; saved only for this division." />

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave()}
              className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save override'}
            </button>
            {hasOverride && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleClear()}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear override (use global)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
