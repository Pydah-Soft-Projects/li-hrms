'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
    SettingsPanel,
    SettingsPanelHeader,
    SettingsSaveBar,
    SettingsSectionCard,
} from './SettingsPageShell';

import LeaveTypesManager from './leave/LeaveTypesManager';
import LeavePolicy from './leave/LeavePolicy';
import LeaveWorkflow from './leave/LeaveWorkflow';

const LeaveSettings = ({ type = 'leave' }: { type?: 'leave' | 'od' | 'ccl' }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [settings, setSettings] = useState<{
        type: string;
        types: { _id: string; name: string; code: string; isPaid: boolean; gender?: string[]; minServiceDays: number }[];
        statuses: { id: string; label: string; color: string }[];
        workflow: {
            isEnabled: boolean;
            steps: { stepOrder: number; stepName: string; approverRole: string; isActive: boolean }[];
            finalAuthority: { role: string; anyHRCanApprove: boolean };
        };
        settings: {
            allowBackdated: boolean;
            maxBackdatedDays: number;
            allowFutureDated: boolean;
            maxAdvanceDays: number;
        };
    }>({
        type,
        types: [],
        statuses: [],
        workflow: { isEnabled: false, steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
        settings: {
            allowBackdated: false,
            maxBackdatedDays: 0,
            allowFutureDated: false,
            maxAdvanceDays: 0,
        }
    });

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.getLeaveSettings(type);
            if (res.success && res.data) {
                setSettings(prev => ({
                    ...prev,
                    ...res.data,
                    // Deeply merge nested objects to ensure properties like finalAuthority exist
                    workflow: {
                        ...prev.workflow,
                        ...(res.data.workflow || {})
                    },
                    settings: {
                        ...prev.settings,
                        ...(res.data.settings || {})
                    }
                }));
            }
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
        } catch {
            toast.error('An error occurred during save');
        } finally {
            setSaving(false);
        }
    };

    // Auto-save when settings change
    const handleSettingsChange = async (newSettings: typeof settings) => {
        setSettings(newSettings);
        try {
            await api.saveLeaveSettings(type, newSettings);
            toast.success('Settings updated');
        } catch {
            toast.error('Failed to update settings');
        }
    };

    if (loading) return <SettingsSkeleton />;

    const title =
        type === 'leave' ? 'Leave Management' : type === 'od' ? 'On Duty (OD)' : 'Compensatory Casual Leave (CCL)';

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section={type.toUpperCase()}
                title={title}
                subtitle={`Configure ${type} categories, eligibility policies, and approval workflows.`}
            />

            <div className="grid grid-cols-1 items-start gap-6 md:gap-8 xl:grid-cols-2">
                <div className="space-y-6 md:space-y-8">
                    {type !== 'ccl' && (
                        <SettingsSectionCard title={`${type.toUpperCase()} Types`} accent>
                            <LeaveTypesManager
                                types={settings.types || []}
                                onChange={(ts) => setSettings({ ...settings, types: ts })}
                            />
                            <div className="mt-6">
                                <SettingsSaveBar
                                    onSave={handleSave}
                                    saving={saving}
                                    label={`Save ${type.toUpperCase()} Types`}
                                />
                            </div>
                        </SettingsSectionCard>
                    )}

                    <LeavePolicy
                        settings={settings}
                        onChange={handleSettingsChange}
                    />
                </div>

                <LeaveWorkflow
                    workflow={settings.workflow}
                    onChange={(wf) => setSettings({ ...settings, workflow: wf })}
                />
                <SettingsSaveBar onSave={handleSave} saving={saving} label="Save Workflow" />
            </div>
        </SettingsPanel>
    );
};

export default LeaveSettings;
