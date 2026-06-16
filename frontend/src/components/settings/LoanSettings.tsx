'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import WorkflowManager, { WorkflowData } from './shared/WorkflowManager';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import { settingsInputClass, settingsInputStyle } from '@/lib/settingsUi';

const LoanSettings = ({ type = 'loan' }: { type?: 'loan' | 'salary_advance' }) => {
    const [loanSettings, setLoanSettings] = useState({
        maxAmount: 50000,
        interestRate: 0,
        isInterestApplicable: false,
        maxTenure: 12,
        allowMultiple: false,
    });
    const [workflow, setWorkflow] = useState<WorkflowData>({
        isEnabled: true,
        steps: [],
        finalAuthority: { role: 'admin', anyHRCanApprove: false }
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                setLoading(true);
                const res = await api.getLoanSettings(type);

                if (res.success && res.data) {
                    if (res.data.settings) setLoanSettings(res.data.settings);
                    if (res.data.workflow) setWorkflow(res.data.workflow);
                }
            } catch (err) {
                console.error('Failed to load settings', err);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, [type]);

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.saveLoanSettings(type, {
                settings: loanSettings,
                workflow: { ...workflow, isEnabled: true }
            });
            toast.success('Settings updated successfully');
        } catch {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section={type.replace('_', ' ')}
                title="Capital Disbursement"
                subtitle="Configure loan/advance parameters and authorization gates."
            />

            <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-3">
                <div className="space-y-8 xl:col-span-1">
                    <SettingsSectionCard title="Financial Caps">
                        <div className="space-y-6">
                            <SettingsField label="Maximum Amount">
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">₹</div>
                                    <input
                                        type="number"
                                        value={loanSettings.maxAmount ?? ''}
                                        onChange={(e) => setLoanSettings({ ...loanSettings, maxAmount: parseInt(e.target.value) })}
                                        className={`${settingsInputClass()} pl-8`}
                                        style={settingsInputStyle()}
                                    />
                                </div>
                            </SettingsField>
                            <SettingsField label="Max Tenure (Months)">
                                <input
                                    type="number"
                                    value={loanSettings.maxTenure ?? ''}
                                    onChange={(e) => setLoanSettings({ ...loanSettings, maxTenure: parseInt(e.target.value) })}
                                    className={settingsInputClass()}
                                    style={settingsInputStyle()}
                                />
                            </SettingsField>
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard title="Recovery Logic">
                        <div className="space-y-4">
                            <SettingsToggleRow
                                id="loan-interest-applicable"
                                label="Apply Interest"
                                description="Enable interest calculation for this type."
                                checked={loanSettings.isInterestApplicable}
                                onChange={(next) => setLoanSettings({ ...loanSettings, isInterestApplicable: next })}
                            />

                            <SettingsField label="Interest Rate (%)">
                                <input
                                    type="number"
                                    disabled={!loanSettings.isInterestApplicable}
                                    value={loanSettings.interestRate ?? ''}
                                    onChange={(e) => setLoanSettings({ ...loanSettings, interestRate: parseFloat(e.target.value) })}
                                    className={`${settingsInputClass()} transition-opacity duration-300 ${!loanSettings.isInterestApplicable ? 'pointer-events-none opacity-50' : 'opacity-100'}`}
                                    style={settingsInputStyle()}
                                />
                            </SettingsField>
                        </div>

                        <div className="pt-6">
                            <SettingsSaveBar onSave={handleSave} saving={saving} label="Commit Settings" />
                        </div>
                    </SettingsSectionCard>
                </div>

                <div className="xl:col-span-2">
                    <SettingsSectionCard>
                        <WorkflowManager
                            workflow={workflow}
                            onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                            title="Multi-Level Approval"
                            description="Workflow Engine for capital disbursement."
                            addStepLabel="Append Authorization Level"
                        />

                        <div className="pt-6">
                            <SettingsSaveBar onSave={handleSave} saving={saving} label="Commit Authorization Chain" />
                        </div>
                    </SettingsSectionCard>
                </div>
            </div>
        </SettingsPanel>
    );
};

export default LoanSettings;
