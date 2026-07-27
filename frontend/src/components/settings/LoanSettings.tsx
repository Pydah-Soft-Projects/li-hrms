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

type GuarantorRules = {
  collectionTiming: 'on_application' | 'on_workflow_stage';
  minGuarantors: number;
  maxGuarantors: number;
  maxGuaranteePercentOfSalary: number;
  includeOwnEmi: boolean;
  includeGuaranteedEmi: boolean;
  minServicePeriodMonths: number;
  minSalary: number;
  sameDivisionOnly: boolean;
  sameDepartmentOnly: boolean;
  activeEmployeeOnly: boolean;
};

const DEFAULT_GUARANTOR_RULES: GuarantorRules = {
  collectionTiming: 'on_workflow_stage',
  minGuarantors: 2,
  maxGuarantors: 4,
  maxGuaranteePercentOfSalary: 60,
  includeOwnEmi: true,
  includeGuaranteedEmi: true,
  minServicePeriodMonths: 0,
  minSalary: 0,
  sameDivisionOnly: true,
  sameDepartmentOnly: false,
  activeEmployeeOnly: true,
};

const LoanSettings = ({ type = 'loan' }: { type?: 'loan' | 'salary_advance' }) => {
    const [loanSettings, setLoanSettings] = useState({
        maxAmount: 50000,
        interestRate: 0,
        isInterestApplicable: false,
        maxTenure: 12,
        allowMultiple: false,
        multiEmiCollectionMode: 'collect_all' as string,
        maxCombinedEmiAmount: null as number | null,
        multiEmiPriority: 'oldest_first' as string,
        accrueInterestOnSkippedEmi: true,
        preEmiInterestEnabled: true,
    });
    const [guarantorRules, setGuarantorRules] = useState<GuarantorRules>(DEFAULT_GUARANTOR_RULES);
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
                    if (res.data.guarantorRules && type === 'loan') {
                        setGuarantorRules({ ...DEFAULT_GUARANTOR_RULES, ...res.data.guarantorRules });
                    }
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
                workflow: { ...workflow, isEnabled: true },
                ...(type === 'loan' ? { guarantorRules } : {}),
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
                subtitle="Configure loan/advance parameters, guarantor rules, and authorization gates."
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
                                checked={!!loanSettings.isInterestApplicable}
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

                            {type === 'loan' && (
                                <>
                                    <SettingsToggleRow
                                        id="pre-emi-interest"
                                        label="Pre-EMI interest"
                                        description="Charge interest for months between interest start and EMI commence date."
                                        checked={loanSettings.preEmiInterestEnabled !== false}
                                        onChange={(next) => setLoanSettings({ ...loanSettings, preEmiInterestEnabled: next })}
                                    />
                                    <SettingsField label="Multi-loan EMI collection">
                                        <select
                                            value={loanSettings.multiEmiCollectionMode || 'collect_all'}
                                            onChange={(e) => setLoanSettings({ ...loanSettings, multiEmiCollectionMode: e.target.value })}
                                            className={settingsInputClass()}
                                            style={settingsInputStyle()}
                                        >
                                            <option value="collect_all">Collect all due EMIs together</option>
                                            <option value="single_emi_only">Collect only one EMI per payroll</option>
                                            <option value="max_combined_cap">Cap combined EMI amount</option>
                                        </select>
                                    </SettingsField>
                                    {(loanSettings.multiEmiCollectionMode === 'single_emi_only' ||
                                        loanSettings.multiEmiCollectionMode === 'max_combined_cap') && (
                                        <SettingsField label="Which EMI to prefer">
                                            <select
                                                value={loanSettings.multiEmiPriority || 'oldest_first'}
                                                onChange={(e) => setLoanSettings({ ...loanSettings, multiEmiPriority: e.target.value })}
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            >
                                                <option value="oldest_first">Oldest loan first</option>
                                                <option value="newest_first">Newest loan first</option>
                                                <option value="highest_emi_first">Highest EMI first</option>
                                            </select>
                                        </SettingsField>
                                    )}
                                    {loanSettings.multiEmiCollectionMode === 'max_combined_cap' && (
                                        <SettingsField label="Max combined EMI (₹)">
                                            <input
                                                type="number"
                                                min={0}
                                                value={loanSettings.maxCombinedEmiAmount ?? ''}
                                                onChange={(e) =>
                                                    setLoanSettings({
                                                        ...loanSettings,
                                                        maxCombinedEmiAmount: e.target.value ? parseInt(e.target.value, 10) : null,
                                                    })
                                                }
                                                className={settingsInputClass()}
                                                style={settingsInputStyle()}
                                            />
                                        </SettingsField>
                                    )}
                                    <SettingsToggleRow
                                        id="skip-emi-interest"
                                        label="Accrue interest on skipped EMI"
                                        description="If an EMI is due but not collected (single/cap mode), post monthly interest and roll the due month forward."
                                        checked={loanSettings.accrueInterestOnSkippedEmi !== false}
                                        onChange={(next) => setLoanSettings({ ...loanSettings, accrueInterestOnSkippedEmi: next })}
                                    />
                                </>
                            )}
                        </div>

                        <div className="pt-6">
                            <SettingsSaveBar onSave={handleSave} saving={saving} label="Commit Settings" />
                        </div>
                    </SettingsSectionCard>

                    {type === 'loan' && (
                        <SettingsSectionCard title="Guarantor rules">
                            <div className="space-y-4">
                                <SettingsField label="When to collect guarantors">
                                    <select
                                        value={guarantorRules.collectionTiming}
                                        onChange={(e) => setGuarantorRules({ ...guarantorRules, collectionTiming: e.target.value as GuarantorRules['collectionTiming'] })}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    >
                                        <option value="on_workflow_stage">At configured workflow stage</option>
                                        <option value="on_application">At application creation</option>
                                    </select>
                                </SettingsField>
                                <SettingsField label="Min guarantors">
                                    <input type="number" min={1} value={guarantorRules.minGuarantors} onChange={(e) => setGuarantorRules({ ...guarantorRules, minGuarantors: parseInt(e.target.value) || 1 })} className={settingsInputClass()} style={settingsInputStyle()} />
                                </SettingsField>
                                <SettingsField label="Max guarantors">
                                    <input type="number" min={1} value={guarantorRules.maxGuarantors} onChange={(e) => setGuarantorRules({ ...guarantorRules, maxGuarantors: parseInt(e.target.value) || 1 })} className={settingsInputClass()} style={settingsInputStyle()} />
                                </SettingsField>
                                <SettingsField label="Max guarantee % of salary">
                                    <input type="number" min={0} max={100} value={guarantorRules.maxGuaranteePercentOfSalary} onChange={(e) => setGuarantorRules({ ...guarantorRules, maxGuaranteePercentOfSalary: parseFloat(e.target.value) || 60 })} className={settingsInputClass()} style={settingsInputStyle()} />
                                </SettingsField>
                                <SettingsField label="Min salary (₹)">
                                    <input type="number" min={0} value={guarantorRules.minSalary} onChange={(e) => setGuarantorRules({ ...guarantorRules, minSalary: parseInt(e.target.value) || 0 })} className={settingsInputClass()} style={settingsInputStyle()} />
                                </SettingsField>
                                <SettingsField label="Min service (months)">
                                    <input type="number" min={0} value={guarantorRules.minServicePeriodMonths} onChange={(e) => setGuarantorRules({ ...guarantorRules, minServicePeriodMonths: parseInt(e.target.value) || 0 })} className={settingsInputClass()} style={settingsInputStyle()} />
                                </SettingsField>
                                <SettingsToggleRow id="gr-own-emi" label="Include own EMI" checked={guarantorRules.includeOwnEmi} onChange={(v) => setGuarantorRules({ ...guarantorRules, includeOwnEmi: v })} />
                                <SettingsToggleRow id="gr-guaranteed-emi" label="Include guaranteed EMI" checked={guarantorRules.includeGuaranteedEmi} onChange={(v) => setGuarantorRules({ ...guarantorRules, includeGuaranteedEmi: v })} />
                                <SettingsToggleRow id="gr-same-div" label="Same division only" checked={guarantorRules.sameDivisionOnly} onChange={(v) => setGuarantorRules({ ...guarantorRules, sameDivisionOnly: v })} />
                                <SettingsToggleRow id="gr-same-dept" label="Same department only" checked={guarantorRules.sameDepartmentOnly} onChange={(v) => setGuarantorRules({ ...guarantorRules, sameDepartmentOnly: v })} />
                            </div>
                        </SettingsSectionCard>
                    )}
                </div>

                <div className="xl:col-span-2">
                    <SettingsSectionCard>
                        <WorkflowManager
                            workflow={workflow}
                            onChange={(newWorkflow: WorkflowData) => setWorkflow(newWorkflow)}
                            title="Multi-Level Approval"
                            description="Workflow Engine for capital disbursement."
                            addStepLabel="Append Authorization Level"
                            showLoanStageCapabilities={type === 'loan'}
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
