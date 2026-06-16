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
import { leaveSettingsLabels, normalizeLeaveTypeItem, serializeLeaveTypesForSave } from './leave/leaveSettingsLabels';

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
                const loadedTypes = Array.isArray(res.data.types)
                    ? res.data.types.map((t: Record<string, unknown>) => normalizeLeaveTypeItem(t, type))
                    : [];

                setSettings(prev => ({
                    ...prev,
                    ...res.data,
                    types: loadedTypes,
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
            toast.error(`Failed to load ${type === 'od' ? 'OD' : type === 'ccl' ? 'CCL' : 'leave'} settings`);
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
            const payload = {
                ...settings,
                types: serializeLeaveTypesForSave(settings.types || [], type),
            };
            const res = await api.saveLeaveSettings(type, payload);
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
            const payload = {
                ...newSettings,
                types: serializeLeaveTypesForSave(newSettings.types || [], type),
            };
            await api.saveLeaveSettings(type, payload);
            toast.success('Settings updated');
        } catch {
            toast.error('Failed to update settings');
        }
    };

    if (loading) return <SettingsSkeleton />;

    const copy = leaveSettingsLabels(type);

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section={type === 'od' ? 'OD' : type === 'ccl' ? 'CCL' : 'Leave'}
                title={copy.panelTitle}
                subtitle={copy.panelSubtitle}
            />

            <div className="grid grid-cols-1 items-start gap-6 md:gap-8 xl:grid-cols-2">
                <div className="space-y-6 md:space-y-8">
                    {type !== 'ccl' && (
                        <SettingsSectionCard title={copy.typesSectionTitle} accent>
                            <LeaveTypesManager
                                kind={type}
                                types={settings.types || []}
                                onChange={(ts) => setSettings({ ...settings, types: ts })}
                            />
                            <div className="mt-6">
                                <SettingsSaveBar
                                    onSave={handleSave}
                                    saving={saving}
                                    label={copy.saveTypesLabel}
                                />
                            </div>
                        </SettingsSectionCard>
                    )}

                    <LeavePolicy
                        kind={type}
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
