'use client';

import React from 'react';
import { ShieldCheck, Plus, Trash2, ArrowRight, UserCheck, LucideIcon } from 'lucide-react';
import {
  SettingsOutlineButton,
  SettingsToggleRow,
} from '@/components/settings/SettingsPageShell';
import {
  settingsFieldHelpClass,
  settingsInputClass,
  settingsInputStyle,
  settingsLedgerBorder,
  settingsSectionTitleClass,
  settingsToggleThumbClass,
  settingsToggleTrackClass,
} from '@/lib/settingsUi';

export interface WorkflowStep {
    stepOrder: number;
    stepName: string;
    approverRole: string;
    isActive: boolean;
    canEditLWD?: boolean;
}

export interface WorkflowData {
    isEnabled: boolean;
    steps: WorkflowStep[];
    finalAuthority: {
        role: string;
        anyHRCanApprove: boolean;
    };
    /** When true, approvers with a role later in the chain can act on requests still at an earlier step */
    allowHigherAuthorityToApproveLowerLevels?: boolean;
}

interface WorkflowManagerProps {
    workflow: WorkflowData;
    onChange: (workflow: WorkflowData) => void;
    title?: string;
    description?: string;
    icon?: LucideIcon;
    addStepLabel?: string;
    isResignationWorkflow?: boolean;
}

const WorkflowManager = ({
    workflow,
    onChange,
    title = "Multi-Level Approval",
    description = "Workflow Engine for automated authorization.",
    icon: Icon = ShieldCheck,
    addStepLabel = "Add Next Approval Stage",
    isResignationWorkflow = false
}: WorkflowManagerProps) => {
    const steps = workflow?.steps || [];

    const updateStatus = (newWorkflow: Partial<WorkflowData>) => {
        const finalWorkflow = {
            isEnabled: true, // Always force true now
            steps: steps,
            finalAuthority: workflow?.finalAuthority || { role: 'admin', anyHRCanApprove: false },
            allowHigherAuthorityToApproveLowerLevels: workflow?.allowHigherAuthorityToApproveLowerLevels ?? false,
            ...newWorkflow
        } as WorkflowData;

        if (finalWorkflow.steps.length > 0) {
            const lastStep = finalWorkflow.steps[finalWorkflow.steps.length - 1];
            finalWorkflow.finalAuthority = {
                ...finalWorkflow.finalAuthority,
                role: lastStep.approverRole
            };
        }
        onChange(finalWorkflow);
    };

    const update = <K extends keyof WorkflowData>(key: K, value: WorkflowData[K]) => {
        updateStatus({ ...workflow, [key]: value });
    };

    const addStep = () => {
        const nextOrder = steps.length + 1;
        const newSteps: WorkflowStep[] = [
            ...steps,
            {
                stepOrder: nextOrder,
                approverRole: 'manager',
                stepName: `Level ${nextOrder} Approval`,
                isActive: true,
                canEditLWD: false,
            },
        ];
        update('steps', newSteps);
    };

    const removeStep = (idx: number) => {
        const newSteps = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepOrder: i + 1 }));
        update('steps', newSteps);
    };

    const updateStep = <K extends keyof WorkflowStep>(idx: number, field: K, value: WorkflowStep[K]) => {
        const next = [...steps];
        next[idx] = { ...next[idx], [field]: value };
        update('steps', next);
    };

    const formatRoleName = (role: string) => {
        if (!role) return 'Admin';
        if (role === 'super_admin') return 'Admin';
        return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4" style={settingsLedgerBorder}>
                <div className="flex items-center gap-3">
                    <div
                        className="flex h-10 w-10 items-center justify-center"
                        style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}
                    >
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className={settingsSectionTitleClass}>{title}</h3>
                        <p className={settingsFieldHelpClass}>{description}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div className="mb-6 flex flex-wrap items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                    <div className="whitespace-nowrap border px-3 py-1.5 text-[10px] font-semibold uppercase text-stone-400" style={settingsLedgerBorder}>
                        Employee Application
                    </div>
                    <ArrowRight className="h-3 w-3 shrink-0 text-stone-300" />
                    {steps.map((step, idx) => (
                        <React.Fragment key={idx}>
                            <div
                                className="flex items-center gap-2 whitespace-nowrap border px-3 py-1.5 text-[10px] font-semibold uppercase text-[color:var(--ps-accent-ink)]"
                                style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}
                            >
                                {step.stepName || `Level ${step.stepOrder}`}
                            </div>
                            <ArrowRight className="h-3 w-3 shrink-0 text-stone-300" />
                        </React.Fragment>
                    ))}
                    <div className="whitespace-nowrap border px-3 py-1.5 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400" style={settingsLedgerBorder}>
                        Final Approval
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {steps.map((step, idx) => (
                        <div
                            key={idx}
                            className="group relative flex items-center gap-6 border p-4 sm:p-5"
                            style={settingsLedgerBorder}
                        >
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center font-bold text-[color:var(--ps-accent)]"
                                style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}
                            >
                                {step.stepOrder}
                            </div>
                            <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className={settingsSectionTitleClass}>Step Label</label>
                                    <input
                                        type="text"
                                        value={step.stepName}
                                        onChange={(e) => updateStep(idx, 'stepName', e.target.value)}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                        placeholder="e.g. HOD Approval"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className={settingsSectionTitleClass}>Approver Role</label>
                                    <select
                                        value={step.approverRole}
                                        onChange={(e) => updateStep(idx, 'approverRole', e.target.value)}
                                        className={settingsInputClass()}
                                        style={settingsInputStyle()}
                                    >
                                        <option value="reporting_manager">Reporting Manager</option>
                                        <option value="manager">Division Manager</option>
                                        <option value="hod">Dept. Head (HOD)</option>
                                        <option value="hr">HR Executive/Admin</option>
                                        <option value="super_admin">Admin</option>
                                    </select>
                                    {step.approverRole === 'reporting_manager' && (
                                        <p className={settingsFieldHelpClass}>* Falls back to HOD if no manager is assigned</p>
                                    )}
                                </div>
                                {isResignationWorkflow && (
                                    <div className="flex flex-col justify-center gap-2">
                                        <label className={settingsSectionTitleClass}>Can Edit LWD</label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => updateStep(idx, 'canEditLWD', !step.canEditLWD)}
                                                className={settingsToggleTrackClass(!!step.canEditLWD)}
                                            >
                                                <span className={settingsToggleThumbClass(!!step.canEditLWD)} />
                                            </button>
                                            <span className="text-[10px] font-medium uppercase text-stone-500">{step.canEditLWD ? 'Yes' : 'No'}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => removeStep(idx)}
                                className="p-2 text-stone-300 transition-colors hover:text-rose-500"
                            >
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                    <SettingsOutlineButton onClick={addStep} className="w-full justify-center py-4">
                        <Plus className="h-4 w-4" /> {addStepLabel}
                    </SettingsOutlineButton>
                </div>

                <SettingsToggleRow
                    id="workflow-higher-authority"
                    label="Allow higher authority to approve lower levels"
                    description="When ON, approvers later in the chain (e.g. HR) can approve or reject even when the request is still at an earlier step (e.g. waiting for HOD)."
                    checked={workflow?.allowHigherAuthorityToApproveLowerLevels ?? false}
                    onChange={(next) => update('allowHigherAuthorityToApproveLowerLevels', next)}
                />

                <div className="mt-4 border p-4 sm:p-6" style={settingsLedgerBorder}>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex h-10 w-10 items-center justify-center text-emerald-600 dark:text-emerald-400"
                                style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(16,185,129,0.08)' }}
                            >
                                <UserCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className={settingsSectionTitleClass}>Final Authority</h4>
                                <p className="text-xs font-semibold uppercase text-stone-900 dark:text-stone-100">
                                    {steps.length > 0
                                        ? formatRoleName(steps[steps.length - 1].approverRole)
                                        : 'Admin'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 border p-2 sm:p-3" style={settingsLedgerBorder}>
                            <span className="whitespace-nowrap text-[10px] font-semibold uppercase text-stone-400">Any HR can approve</span>
                            <button
                                type="button"
                                onClick={() => update('finalAuthority', {
                                    role: workflow?.finalAuthority?.role || 'admin',
                                    anyHRCanApprove: !workflow?.finalAuthority?.anyHRCanApprove
                                })}
                                className={settingsToggleTrackClass(!!workflow?.finalAuthority?.anyHRCanApprove)}
                            >
                                <span className={settingsToggleThumbClass(!!workflow?.finalAuthority?.anyHRCanApprove)} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkflowManager;
