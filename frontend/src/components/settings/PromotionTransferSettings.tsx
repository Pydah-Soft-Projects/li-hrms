'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { Award } from 'lucide-react';
import { SettingsSkeleton } from './SettingsSkeleton';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';

const PromotionTransferSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<{
    workflow: WorkflowData;
  }>({
    workflow: {
      isEnabled: true,
      steps: [],
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
    },
  });

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getPromotionTransferSettings();
      if (res.success && res.data) {
        const d = res.data;
        setSettings({
          workflow: {
            isEnabled: d.workflow?.isEnabled !== false,
            steps: (d.workflow?.steps || []).map(
              (s: { stepOrder: number; stepName?: string; approverRole?: string; role?: string }) => ({
                stepOrder: s.stepOrder,
                stepName: s.stepName || s.approverRole || 'Approval',
                approverRole: s.approverRole || s.role || 'hr',
                isActive: true,
              })
            ),
            finalAuthority: d.workflow?.finalAuthority || { role: 'hr', anyHRCanApprove: true },
            allowHigherAuthorityToApproveLowerLevels: d.workflow?.allowHigherAuthorityToApproveLowerLevels ?? false,
          },
        });
      }
    } catch (err) {
      console.error('Error loading promotion/transfer settings', err);
      toast.error('Failed to load promotions & transfer workflow settings');
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
        workflow: {
          isEnabled: settings.workflow.isEnabled,
          steps: settings.workflow.steps.map((s) => ({
            stepOrder: s.stepOrder,
            stepName: s.stepName,
            approverRole: s.approverRole,
          })),
          finalAuthority: settings.workflow.finalAuthority,
          allowHigherAuthorityToApproveLowerLevels: settings.workflow.allowHigherAuthorityToApproveLowerLevels ?? false,
        },
      };
      const res = await api.savePromotionTransferSettings(payload);
      if (res.success) {
        toast.success('Promotions & transfers approval workflow saved');
        await loadSettings();
      } else {
        toast.error((res as { message?: string }).message || 'Failed to save settings');
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
        section="Human resources"
        title="Promotions & transfers"
        subtitle="Approval workflow for promotions, demotions, increments, and transfers."
      />

      <SettingsSectionCard title="Workflow">
        <div className="space-y-8">
          <SettingsToggleRow
            id="promotion-transfer-workflow-enabled"
            label="Additional approval stages"
            description="When on, define the ordered approval chain below. When off, requests use the default first approver (RM or HOD), then final authority."
            checked={settings.workflow.isEnabled}
            onChange={(next) =>
              setSettings((s) => ({
                ...s,
                workflow: { ...s.workflow, isEnabled: next },
              }))
            }
          />

          {settings.workflow.isEnabled ? (
            <WorkflowManager
              workflow={settings.workflow}
              onChange={(workflow) => setSettings((s) => ({ ...s, workflow }))}
              title="Approval workflow"
              description="Add each approval stage in order."
              addStepLabel="Add approval stage"
              icon={Award}
            />
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Multi-level stages are off. Requests use the default first approver, then final authority.
            </p>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSaveBar onSave={handleSave} saving={saving} label="Save workflow" />
    </SettingsPanel>
  );
};

export default PromotionTransferSettings;
