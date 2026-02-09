'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, ClipboardList, Settings2, ShieldCheck, Globe, Info } from 'lucide-react';

import LeaveTypesManager from './leave/LeaveTypesManager';
import LeavePolicy from './leave/LeavePolicy';
import LeaveWorkflow from './leave/LeaveWorkflow';
import LeaveWorkspaceAccess from './leave/LeaveWorkspaceAccess';

const LeaveSettings = ({ type = 'leave' }: { type?: 'leave' | 'od' }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [subTab, setSubTab] = useState<'types' | 'policy' | 'workflow' | 'workspace'>('types');
    const [workspaces, setWorkspaces] = useState<any[]>([]);

    const [settings, setSettings] = useState<any>({
        type,
        types: [],
        statuses: [],
        workflow: { isEnabled: false, steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
        settings: {
            allowBackdated: false,
            maxBackdatedDays: 0,
            allowFutureDated: false,
            maxAdvanceDays: 0,
        },
        workspacePermissions: {}
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const [res, wsRes] = await Promise.all([
                api.getLeaveSettings(type),
                api.getWorkspaces()
            ]);

            if (res.success && res.data) setSettings(res.data);
            if (wsRes.success) setWorkspaces(wsRes.data || []);
        } catch (err) {
            console.error(`Error loading leave settings:`, err);
            toast.error('Failed to load leave settings');
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.saveLeaveSettings(type, settings);
            if (res.success) toast.success(`${type.toUpperCase()} settings updated successfully`);
            else toast.error(res.message || 'Failed to save settings');
        } catch (err) {
            toast.error('An error occurred during save');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <span className="capitalize">{type}</span> Configuration
                        {type === 'leave' && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-400 font-bold uppercase tracking-wider">Primary</span>}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Configure {type} types, approval workflows, and branch-level access controls.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                >
                    {saving ? <Spinner /> : <Save className="h-4 w-4" />}
                    Update Changes
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur-md rounded-2xl w-fit">
                {[
                    { id: 'types' as const, label: 'Leave Types', icon: ClipboardList },
                    { id: 'policy' as const, label: 'Application Policy', icon: Settings2 },
                    { id: 'workflow' as const, label: 'Approval Workflow', icon: ShieldCheck },
                    { id: 'workspace' as const, label: 'Workspace Access', icon: Globe }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setSubTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${subTab === tab.id
                            ? 'bg-white dark:bg-gray-700 shadow-xl shadow-indigo-500/5 text-indigo-600 scale-105'
                            : 'text-gray-400 hover:text-gray-600 hover:bg-white/50 dark:hover:bg-gray-700/50'
                            }`}
                    >
                        <tab.icon className={`h-4 w-4 ${subTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="relative min-h-[500px] p-2">
                {subTab === 'types' && <LeaveTypesManager types={settings.types || []} onChange={(ts) => setSettings({ ...settings, types: ts })} />}
                {subTab === 'policy' && <LeavePolicy settings={settings} onChange={setSettings} />}
                {subTab === 'workflow' && <LeaveWorkflow workflow={settings.workflow} onChange={(wf) => setSettings({ ...settings, workflow: wf })} />}
                {subTab === 'workspace' && (
                    <LeaveWorkspaceAccess
                        workspacePermissions={settings.settings?.workspacePermissions || {}}
                        workspaces={workspaces}
                        onChange={(wp) => setSettings({ ...settings, settings: { ...settings.settings, workspacePermissions: wp } })}
                    />
                )}
            </div>

            <div className="p-6 rounded-[30px] bg-gradient-to-br from-gray-900 to-indigo-950 text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Info className="h-32 w-32" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="max-w-xl">
                        <h4 className="text-lg font-bold flex items-center gap-2">
                            <Info className="h-5 w-5 text-indigo-400" />
                            Understanding {type} Settings
                        </h4>
                        <p className="text-xs text-indigo-100/60 mt-2 leading-relaxed">
                            Settings applied here are global but can be restricted per workspace.
                            The &quot;Workflow&quot; defines the approval chain, while &quot;Policy&quot; controls submission timing.
                            Changes won&apos;t affect already submitted or approved requests.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/10">
                            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase">System synchronized</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeaveSettings;
