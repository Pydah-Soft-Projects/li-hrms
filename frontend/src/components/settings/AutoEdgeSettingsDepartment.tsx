'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { SettingsPanel, SettingsPanelHeader, SettingsSaveBar, SettingsSectionCard } from './SettingsPageShell';
import { DEPT_INPUT, DEPT_LABEL, settingsInputStyle } from '@/lib/settingsUi';
import {
  AutoEdgePermissionRulesEditor,
  emptyRuleSet,
  normalizeAutoRulesForApi,
  toLocalRuleSet,
  validateAutoRuleSets,
  type AutoRuleSet,
} from './AutoEdgePermissionRulesEditor';

type AutoApplyFor = 'late_in' | 'early_out' | 'both';

export type DepartmentAutoEdgeDraft = {
  isEnabled: boolean | null;
  applyFor: AutoApplyFor | null;
  useSameRulesForBoth: boolean | null;
  lateInRules: AutoRuleSet;
  earlyOutRules: AutoRuleSet;
};

function emptyDraft(): DepartmentAutoEdgeDraft {
  return {
    isEnabled: null,
    applyFor: null,
    useSameRulesForBoth: null,
    lateInRules: emptyRuleSet(),
    earlyOutRules: emptyRuleSet(),
  };
}

function draftFromApi(autoEdge: Record<string, unknown> | null | undefined): DepartmentAutoEdgeDraft {
  if (!autoEdge || typeof autoEdge !== 'object') return emptyDraft();
  return {
    isEnabled: typeof autoEdge.isEnabled === 'boolean' ? autoEdge.isEnabled : null,
    applyFor: (autoEdge.applyFor as AutoApplyFor) || null,
    useSameRulesForBoth:
      typeof autoEdge.useSameRulesForBoth === 'boolean' ? autoEdge.useSameRulesForBoth : null,
    lateInRules: toLocalRuleSet(autoEdge.lateInRules as Parameters<typeof toLocalRuleSet>[0]),
    earlyOutRules: toLocalRuleSet(autoEdge.earlyOutRules as Parameters<typeof toLocalRuleSet>[0]),
  };
}

function draftToApiPayload(d: DepartmentAutoEdgeDraft): {
  isEnabled: boolean | null;
  applyFor: AutoApplyFor | null;
  useSameRulesForBoth: boolean | null;
  lateInRules?: ReturnType<typeof normalizeAutoRulesForApi>;
  earlyOutRules?: ReturnType<typeof normalizeAutoRulesForApi>;
} {
  const hasLateRanges = (d.lateInRules?.shiftDurationRanges || []).length > 0;
  const hasEarlyRanges = (d.earlyOutRules?.shiftDurationRanges || []).length > 0;
  return {
    isEnabled: d.isEnabled,
    applyFor: d.applyFor,
    useSameRulesForBoth: d.useSameRulesForBoth,
    lateInRules: hasLateRanges ? normalizeAutoRulesForApi(d.lateInRules) : undefined,
    earlyOutRules: hasEarlyRanges ? normalizeAutoRulesForApi(d.earlyOutRules) : undefined,
  };
}

export default function AutoEdgeSettingsDepartment({
  departmentId,
  divisionId,
  onSaved,
  variant = 'department',
}: {
  departmentId: string;
  divisionId?: string;
  onSaved?: () => void;
  variant?: 'department' | 'divisionWide';
}) {
  const [orgEnabled, setOrgEnabled] = useState(false);
  const [draft, setDraft] = useState<DepartmentAutoEdgeDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [orgRes, deptRes] = await Promise.all([
        api.getAutoEdgePermissionSettings(),
        variant === 'divisionWide' && divisionId
          ? api.getDivisionWideDepartmentSettings(divisionId)
          : api.getDepartmentSettings(departmentId, divisionId),
      ]);
      setOrgEnabled(Boolean(orgRes.success && orgRes.data?.isEnabled));
      if (deptRes.success && deptRes.data && typeof deptRes.data === 'object') {
        const perms = (deptRes.data as Record<string, unknown>).permissions as Record<string, unknown> | undefined;
        setDraft(draftFromApi(perms?.autoEdge as Record<string, unknown>));
      } else {
        setDraft(emptyDraft());
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load auto permission settings');
    } finally {
      setLoading(false);
    }
  }, [departmentId, divisionId, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveApplyFor = draft.applyFor ?? 'both';
  const effectiveSameRules = draft.useSameRulesForBoth ?? true;

  const updateRuleSet = (key: 'lateInRules' | 'earlyOutRules', next: AutoRuleSet) => {
    setDraft((prev) => {
      if (effectiveSameRules) {
        return { ...prev, lateInRules: next, earlyOutRules: next };
      }
      return { ...prev, [key]: next };
    });
  };

  const setTriBool = (field: 'isEnabled' | 'useSameRulesForBoth', value: string) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value === '' ? null : value === 'true',
    }));
  };

  const handleSave = async () => {
    if (variant === 'divisionWide') {
      if (!divisionId) {
        toast.error('Select a division for division-wide settings');
        return;
      }
    } else if (!departmentId) {
      toast.error('Missing department');
      return;
    }

    const enabled = draft.isEnabled ?? orgEnabled;
    if (enabled) {
      const sets =
        effectiveApplyFor === 'late_in'
          ? [{ label: 'Late-in rules', rules: draft.lateInRules }]
          : effectiveApplyFor === 'early_out'
            ? [{ label: 'Early-out rules', rules: draft.earlyOutRules }]
            : effectiveSameRules
              ? [{ label: 'Auto permission rules', rules: draft.lateInRules }]
              : [
                  { label: 'Late-in rules', rules: draft.lateInRules },
                  { label: 'Early-out rules', rules: draft.earlyOutRules },
                ];
      const hasDeptRanges = sets.some((s) => s.rules.shiftDurationRanges.length > 0);
      if (hasDeptRanges) {
        const err = validateAutoRuleSets(sets, true);
        if (err) {
          toast.error(err);
          return;
        }
      } else if (!orgEnabled && draft.isEnabled === true) {
        toast.error('Add at least one department range when enabling without organization defaults.');
        return;
      }
    }

    try {
      setSaving(true);
      const payload = { permissions: { autoEdge: draftToApiPayload(draft) } };
      const res =
        variant === 'divisionWide' && divisionId
          ? await api.updateDivisionWideDepartmentSettings(divisionId, payload)
          : await api.updateDepartmentSettings(departmentId, payload, divisionId);
      if (res.success) {
        toast.success('Auto permission overrides saved');
        onSaved?.();
        await load();
      } else {
        toast.error((res as { message?: string }).message || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save auto permission overrides');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  const inputStyle = settingsInputStyle();
  const compactInput = `w-full ${DEPT_INPUT}`;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        section="Permissions"
        title="Auto Late-In / Early-Out (department)"
        subtitle="Override organization slabs for this department. Empty fields inherit global settings. Times are always 24-hour HH:MM."
      />

      <SettingsSectionCard
        title="Department overrides"
        description={
          orgEnabled
            ? 'Organization auto permissions are enabled. Override only the fields you need.'
            : 'Organization auto permissions are disabled. You can enable and define slabs for this department only.'
        }
        accent
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className={DEPT_LABEL}>Enable auto permissions</span>
              <select
                value={draft.isEnabled === null || draft.isEnabled === undefined ? '' : String(draft.isEnabled)}
                onChange={(e) => setTriBool('isEnabled', e.target.value)}
                className={compactInput}
                style={inputStyle}
              >
                <option value="">Inherit organization ({orgEnabled ? 'enabled' : 'disabled'})</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div className="space-y-1">
              <span className={DEPT_LABEL}>Apply for</span>
              <select
                value={draft.applyFor ?? ''}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    applyFor: e.target.value === '' ? null : (e.target.value as AutoApplyFor),
                  }))
                }
                className={compactInput}
                style={inputStyle}
              >
                <option value="">Inherit organization</option>
                <option value="late_in">Late in</option>
                <option value="early_out">Early out</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>

          {(draft.applyFor ?? 'both') === 'both' && (
            <div className="space-y-1">
              <span className={DEPT_LABEL}>Same ranges for both</span>
              <select
                value={
                  draft.useSameRulesForBoth === null || draft.useSameRulesForBoth === undefined
                    ? ''
                    : String(draft.useSameRulesForBoth)
                }
                onChange={(e) => setTriBool('useSameRulesForBoth', e.target.value)}
                className={compactInput}
                style={inputStyle}
              >
                <option value="">Inherit organization</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          )}

          <p className="text-[10px] text-gray-500">
            Shift duration uses HH:MM as hours (08:00 = 8h). Trigger and allowed use HH:MM as minutes (00:30 = 30 min,
            03:00 = 180 min). Leave ranges empty to use organization slabs.
          </p>

          {effectiveApplyFor === 'late_in' && (
            <AutoEdgePermissionRulesEditor
              title="Late-in ranges (department)"
              help="Override organization late-in slabs. Empty list inherits global ranges."
              ruleSet={draft.lateInRules}
              onChange={(next) => updateRuleSet('lateInRules', next)}
            />
          )}
          {effectiveApplyFor === 'early_out' && (
            <AutoEdgePermissionRulesEditor
              title="Early-out ranges (department)"
              help="Override organization early-out slabs. Empty list inherits global ranges."
              ruleSet={draft.earlyOutRules}
              onChange={(next) => updateRuleSet('earlyOutRules', next)}
            />
          )}
          {effectiveApplyFor === 'both' && effectiveSameRules && (
            <AutoEdgePermissionRulesEditor
              title="Shared late-in / early-out ranges (department)"
              ruleSet={draft.lateInRules}
              onChange={(next) => updateRuleSet('lateInRules', next)}
            />
          )}
          {effectiveApplyFor === 'both' && !effectiveSameRules && (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <AutoEdgePermissionRulesEditor
                title="Late-in ranges (department)"
                ruleSet={draft.lateInRules}
                onChange={(next) => updateRuleSet('lateInRules', next)}
              />
              <AutoEdgePermissionRulesEditor
                title="Early-out ranges (department)"
                ruleSet={draft.earlyOutRules}
                onChange={(next) => updateRuleSet('earlyOutRules', next)}
              />
            </div>
          )}

          <SettingsSaveBar onSave={handleSave} saving={saving} label="Save auto permission overrides" />
        </div>
      </SettingsSectionCard>
    </SettingsPanel>
  );
}
