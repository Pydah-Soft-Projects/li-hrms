'use client';

import React from 'react';
import { ShieldCheck, Plus, Trash2, ArrowRight, UserCheck } from 'lucide-react';

interface LeaveWorkflowProps {
    workflow: any;
    onChange: (workflow: any) => void;
}

const LeaveWorkflow = ({ workflow, onChange }: LeaveWorkflowProps) => {
    const steps = workflow?.steps || [];

    const update = (key: string, value: any) => {
        onChange({ ...workflow, [key]: value });
    };

    const addStep = () => {
        const nextOrder = steps.length + 1;
        update('steps', [
            ...steps,
            {
                stepOrder: nextOrder,
                role: 'manager',
                label: `Level ${nextOrder} Approval`,
                isActive: true,
            },
        ]);
    };

    const removeStep = (idx: number) => {
        update('steps', steps.filter((_: any, i: number) => i !== idx).map((s: any, i: number) => ({ ...s, stepOrder: i + 1 })));
    };

    const updateStep = (idx: number, field: string, value: any) => {
        const next = [...steps];
        next[idx] = { ...next[idx], [field]: value };
        update('steps', next);
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest">Multi-Level Approval</h3>
                        <p className="text-xs text-gray-500">Configure sequential levels for leave approval.</p>
                    </div>
                </div>
                <button
                    onClick={() => update('isEnabled', !workflow.isEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${workflow.isEnabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${workflow.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {workflow.isEnabled ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 mb-8">
                        <div className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-400 uppercase">Employee Application</div>
                        <ArrowRight className="h-3 w-3 text-gray-300" />
                        {steps.map((step: any, idx: number) => (
                            <React.Fragment key={idx}>
                                <div className="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase flex items-center gap-2">
                                    {step.label}
                                </div>
                                <ArrowRight className="h-3 w-3 text-gray-300" />
                            </React.Fragment>
                        ))}
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Final Approval</div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {steps.map((step: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-6 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 font-bold">
                                    {step.stepOrder}
                                </div>
                                <div className="flex-1 grid grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Step Label</label>
                                        <input
                                            type="text"
                                            value={step.label}
                                            onChange={(e) => updateStep(idx, 'label', e.target.value)}
                                            className="w-full bg-transparent border-b border-gray-100 dark:border-gray-800 py-1 text-sm outline-none font-medium"
                                            placeholder="e.g. HOD Approval"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">Approver Role</label>
                                        <select
                                            value={step.role}
                                            onChange={(e) => updateStep(idx, 'role', e.target.value)}
                                            className="w-full bg-transparent border-b border-gray-100 dark:border-gray-800 py-1 text-sm outline-none font-medium text-purple-600"
                                        >
                                            <option value="manager">Reporting Manager</option>
                                            <option value="hod">Dept. Head (HOD)</option>
                                            <option value="hr">HR Executive/Admin</option>
                                            <option value="director">Director/Superadmin</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeStep(idx)}
                                    className="p-2 text-red-200 hover:text-red-500 transition"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={addStep}
                            className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-purple-600 py-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl transition-all"
                        >
                            <Plus className="h-4 w-4" /> Add Next Approval Stage
                        </button>
                    </div>

                    <div className="mt-8 p-6 rounded-3xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                        <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-6">
                            <UserCheck className="h-4 w-4 text-emerald-500" />
                            Final Authority Role
                        </h4>
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500">Authority Role:</span>
                                <select
                                    value={workflow?.finalAuthority?.role || 'hr'}
                                    onChange={(e) => update('finalAuthority', { ...workflow.finalAuthority, role: e.target.value })}
                                    className="bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 text-xs font-bold border-gray-100 dark:border-gray-700 outline-none"
                                >
                                    <option value="hr">HR Role</option>
                                    <option value="super_admin">Super admin</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500">Any HR can approve:</span>
                                <button
                                    onClick={() => update('finalAuthority', { ...workflow.finalAuthority, anyHRCanApprove: !workflow.finalAuthority?.anyHRCanApprove })}
                                    className={`w-10 h-5 rounded-full ${workflow.finalAuthority?.anyHRCanApprove ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                >
                                    <div className={`h-4 w-4 bg-white rounded-full transition-transform ${workflow.finalAuthority?.anyHRCanApprove ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="py-24 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-[40px] flex flex-col items-center">
                    <ShieldCheck className="h-20 w-20 text-gray-100 dark:text-gray-800 mb-6" />
                    <p className="text-sm font-semibold text-gray-400">Workflow is currently disabled.</p>
                    <p className="text-[10px] text-gray-300 mt-2 uppercase tracking-widest">Enable to configure multi-stage approvals.</p>
                </div>
            )}
        </div>
    );
};

export default LeaveWorkflow;
