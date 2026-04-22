'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { Save, ChevronRight, Award } from 'lucide-react';
import { SettingsSkeleton } from './SettingsSkeleton';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';

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
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-gray-200 dark:border-gray-800 pb-5">
        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
          <span>Settings</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-indigo-600">Human resources</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Promotions &amp; transfers — multi-level approval</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure approval stages for salary promotions, demotions, increments, and internal transfers.           When multi-level workflow is
          on and you add stages below, that ordered list is the full approval chain. Add &quot;Reporting manager&quot; as the first stage
          if your policy still needs it. When the workflow is off (or no stages are defined), the first approver defaults to the
          employee&apos;s reporting manager when set, otherwise the department HOD. Unless the chain already ends with your
          &quot;Final authority&quot; role (usually HR), that final approval is appended automatically so requests do not complete after
          only line management.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-8">
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-4 sm:p-6 lg:p-8">
            <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Award className="h-4 w-4 text-violet-500" />
                Workflow
              </h3>
            </div>
            <div className="p-8 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                <div>
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">Additional approval stages</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    When on, the stages below define the full approval order (first to last). When off, only the default first approver
                    applies (reporting manager if set on the employee, otherwise HOD), then the request follows your final-authority
                    rules.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.workflow.isEnabled}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      workflow: { ...s.workflow, isEnabled: !s.workflow.isEnabled },
                    }))
                  }
                  className={`relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors ${
                    settings.workflow.isEnabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                      settings.workflow.isEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {settings.workflow.isEnabled ? (
                <WorkflowManager
                  workflow={settings.workflow}
                  onChange={(workflow) => setSettings((s) => ({ ...s, workflow }))}
                  title="Promotions &amp; transfers — multi-level approval workflow"
                  description="Define each approval stage in order. Include a reporting-manager stage at the top if required. Add HR, division manager, HOD, or admin steps as your policy requires."
                  addStepLabel="Add approval stage"
                  icon={Award}
                />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Multi-level stages are off. New requests use only the default first approver (reporting manager or HOD), then
                  final-authority rules.
                </p>
              )}
            </div>
          </section>
        </div>
        <div>
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Save</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              New requests use this chain immediately. Pending requests keep the workflow they were created with.
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save workflow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromotionTransferSettings;
