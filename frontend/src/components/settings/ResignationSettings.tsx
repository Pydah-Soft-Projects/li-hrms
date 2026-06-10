'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import {
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsFieldHelpClass,
} from '@/lib/settingsUi';

const ResignationSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<{
    noticePeriodDays: number;
    workflow: WorkflowData & { terminationAllowedRoles?: string[] };
  }>({
    noticePeriodDays: 0,
    workflow: {
      isEnabled: true,
      steps: [],
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
      terminationAllowedRoles: ['super_admin', 'hr'],
    },
  });

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getResignationSettings();
      if (res.success && res.data) {
        const d = res.data;
        const noticeDays = Math.max(0, Number(d.noticePeriodDays ?? d.value?.noticePeriodDays ?? 0) || 0);
        setSettings({
          noticePeriodDays: noticeDays,
          workflow: {
            isEnabled: d.workflow?.isEnabled !== false,
            steps: (d.workflow?.steps || []).map((s: { 
              stepOrder: number; 
              stepName?: string; 
              approverRole?: string; 
              role?: string; 
              canEditLWD?: boolean; 
            }) => ({
              stepOrder: s.stepOrder,
              stepName: s.stepName || s.approverRole,
              approverRole: s.approverRole || s.role || 'hr',
              isActive: true,
              canEditLWD: s.canEditLWD || false,
            })),
            finalAuthority: d.workflow?.finalAuthority || { role: 'hr', anyHRCanApprove: true },
            allowHigherAuthorityToApproveLowerLevels: d.workflow?.allowHigherAuthorityToApproveLowerLevels ?? false,
            terminationAllowedRoles: d.workflow?.terminationAllowedRoles || ['super_admin', 'hr'],
          },
        });
      }
    } catch (err) {
      console.error('Error loading resignation settings', err);
      toast.error('Failed to load resignation policy settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        noticePeriodDays: settings.noticePeriodDays,
        workflow: {
          isEnabled: settings.workflow.isEnabled,
          steps: settings.workflow.steps.map((s) => ({
            stepOrder: s.stepOrder,
            stepName: s.stepName,
            approverRole: s.approverRole,
            canEditLWD: s.canEditLWD || false,
          })),
          finalAuthority: settings.workflow.finalAuthority,
          allowHigherAuthorityToApproveLowerLevels: settings.workflow.allowHigherAuthorityToApproveLowerLevels ?? false,
          terminationAllowedRoles: settings.workflow.terminationAllowedRoles || ['super_admin', 'hr'],
        },
      };
      const res = await api.saveResignationSettings(payload);
      if (res.success) {
        toast.success('Resignation policy settings saved successfully');
      } else {
        toast.error(res.message || 'Failed to save settings');
      }
    } catch {
      toast.error('An error occurred during save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        section="Resignation Policy"
        title="Resignation Policy"
        subtitle="Configure notice period and approval workflow for resignation requests. When workflow is enabled, setting a left date goes through this approval flow."
      />

      <SettingsSectionCard title="Notice Period & Workflow">
        <div className="space-y-8">
          <SettingsField
            label="Notice period (days)"
            help="Minimum notice period in days (0 = no minimum)."
          >
            <input
              type="number"
              min={0}
              value={settings.noticePeriodDays}
              onChange={(e) => setSettings((s) => ({ ...s, noticePeriodDays: Number(e.target.value) || 0 }))}
              className={`${settingsInputClass()} max-w-[120px]`}
              style={settingsInputStyle()}
            />
          </SettingsField>

          <WorkflowManager
            workflow={settings.workflow}
            onChange={(workflow) => setSettings((s) => ({ ...s, workflow }))}
            title="Resignation approval workflow"
            description="Approval steps before employee left date is set."
            isResignationWorkflow={true}
          />

          <div className="space-y-4 border-t pt-6" style={settingsLedgerBorder}>
            <SettingsField label="Roles Allowed to Initiate Termination">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {['hr', 'manager', 'hod', 'reporting_manager'].map((role) => (
                  <label
                    key={role}
                    className="flex cursor-pointer items-center gap-3 border p-3 transition-all hover:bg-stone-50 dark:hover:bg-stone-900"
                    style={settingsLedgerBorder}
                  >
                    <input
                      type="checkbox"
                      checked={(settings.workflow.terminationAllowedRoles || []).includes(role)}
                      onChange={(e) => {
                        const roles = [...(settings.workflow.terminationAllowedRoles || [])];
                        if (e.target.checked) {
                          if (!roles.includes(role)) roles.push(role);
                        } else {
                          const index = roles.indexOf(role);
                          if (index > -1) roles.splice(index, 1);
                        }
                        setSettings(s => ({
                          ...s,
                          workflow: { ...s.workflow, terminationAllowedRoles: roles }
                        }));
                      }}
                      className="h-4 w-4 rounded border-stone-300 text-[color:var(--ps-accent)] focus:ring-[color:var(--ps-accent)] dark:border-stone-700 dark:bg-stone-900"
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                      {role.replace('_', ' ')}
                    </span>
                  </label>
                ))}
                <label
                  className="flex cursor-not-allowed items-center gap-3 border p-3 opacity-80"
                  style={{ ...settingsLedgerBorder, borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}
                >
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="h-4 w-4 rounded border-stone-300 text-[color:var(--ps-accent)] dark:border-stone-700 dark:bg-stone-900"
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ps-accent-ink)]">
                    super admin
                  </span>
                </label>
              </div>
            </SettingsField>
            <p className={`${settingsFieldHelpClass} italic`}>Super Admin is always allowed to terminate employees. Other roles must be explicitly granted permission.</p>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSaveBar onSave={handleSave} saving={saving} label="Save settings" />
    </SettingsPanel>
  );
};

export default ResignationSettings;
