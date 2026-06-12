'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';

import { SettingsSkeleton } from './SettingsSkeleton';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import { settingsLedgerBorder } from '@/lib/settingsUi';

const EmployeeSettings = () => {
    const [autoGenerateEmployeeNumber, setAutoGenerateEmployeeNumber] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [updateRequestConfig, setUpdateRequestConfig] = useState({
        enabled: false,
        requestableFields: [] as string[],
        allowQualifications: false
    });
    const [defaultApplyStatutoryDeductions, setDefaultApplyStatutoryDeductions] = useState(true);
    const [defaultApplyAttendanceDeductions, setDefaultApplyAttendanceDeductions] = useState(true);
    const [allFields, setAllFields] = useState<{ id: string; label: string; group: string }[]>([]);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await api.getEmployeeSettings();
            if (res.success && res.data) {
                setAutoGenerateEmployeeNumber(!!res.data.auto_generate_employee_number);
            }

            const configRes = await api.getSetting('profile_update_request_config');
            if (configRes.success && configRes.data) {
                setUpdateRequestConfig(configRes.data.value);
            }

            const statutoryRes = await api.getSetting('default_apply_statutory_deductions');
            if (statutoryRes.success && statutoryRes.data) {
                setDefaultApplyStatutoryDeductions(!!statutoryRes.data.value);
            }
            const attendanceRes = await api.getSetting('default_apply_attendance_deductions');
            if (attendanceRes.success && attendanceRes.data) {
                setDefaultApplyAttendanceDeductions(!!attendanceRes.data.value);
            }

            const formSettingsRes = await api.getFormSettings();
            if (formSettingsRes.success && formSettingsRes.data) {
                const fields: any[] = [];
                formSettingsRes.data.groups.forEach((group: any) => {
                    group.fields.forEach((field: any) => {
                        fields.push({
                            id: field.id,
                            label: field.label,
                            group: group.name
                        });
                    });
                });
                setAllFields(fields);
            }
        } catch (err) {
            console.error('Error loading employee settings:', err);
            toast.error('Failed to load employee settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.updateEmployeeSettings({
                auto_generate_employee_number: autoGenerateEmployeeNumber,
            });

            await api.upsertSetting({
                key: 'profile_update_request_config',
                value: updateRequestConfig,
                category: 'employee',
                description: 'Configuration for employee profile update requests'
            });

            await api.upsertSetting({
                key: 'default_apply_statutory_deductions',
                value: defaultApplyStatutoryDeductions,
                category: 'employee',
                description: 'Default setting for statutory deductions (PT, ESI, PF) for new employees'
            });
            await api.upsertSetting({
                key: 'default_apply_attendance_deductions',
                value: defaultApplyAttendanceDeductions,
                category: 'employee',
                description: 'Default setting for attendance deductions (Late-in, Early-out, etc.) for new employees'
            });

            if (res.success) {
                toast.success('Employee settings saved successfully');
            } else {
                toast.error(res.message || 'Failed to save settings');
            }
        } catch (err) {
            toast.error('An error occurred while saving');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <SettingsSkeleton />;

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section="Employee"
                title="Employee Setup"
                subtitle="Configure employee numbering and profile update policies."
            />

            <SettingsSectionCard title="Employee records">
                <div className="mb-4">
                    <span
                        className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight text-emerald-600"
                        style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(16,185,129,0.08)' }}
                    >
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        MongoDB storage
                    </span>
                </div>

                <SettingsToggleRow
                    id="autoGenerateEmployeeNumber"
                    label="Auto generate employee number"
                    description="When ON, new employees (and bulk upload rows without a number) get the next number automatically. When OFF, employee number is required."
                    checked={autoGenerateEmployeeNumber}
                    onChange={setAutoGenerateEmployeeNumber}
                />
            </SettingsSectionCard>

            <SettingsSectionCard title="Profile Update Request Configuration">
                <div className="mb-4 flex items-center justify-end">
                    <span
                        className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight ${
                            updateRequestConfig.enabled ? 'text-emerald-600' : 'text-stone-400'
                        }`}
                        style={settingsLedgerBorder}
                    >
                        {updateRequestConfig.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>

                <div className="space-y-4">
                    <SettingsToggleRow
                        id="profileUpdateRequestEnabled"
                        label="Profile update requests"
                        description="Allow employees to submit profile update requests for HR approval."
                        checked={updateRequestConfig.enabled}
                        onChange={(next) => setUpdateRequestConfig({ ...updateRequestConfig, enabled: next })}
                    />

                    <SettingsToggleRow
                        id="allowQualifications"
                        label="Allow qualifications in requests"
                        description="Employees can request changes to qualifications when profile update requests are enabled."
                        checked={updateRequestConfig.allowQualifications}
                        onChange={(next) => setUpdateRequestConfig({ ...updateRequestConfig, allowQualifications: next })}
                        disabled={!updateRequestConfig.enabled}
                    />

                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-tight text-stone-900 dark:text-stone-100">
                            Requestable fields
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {allFields.map((field) => {
                                const checked = updateRequestConfig.requestableFields.includes(field.id);
                                return (
                                    <label
                                        key={field.id}
                                        className={`flex items-center gap-2 border px-3 py-2 text-xs ${
                                            updateRequestConfig.enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                                        }`}
                                        style={settingsLedgerBorder}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={!updateRequestConfig.enabled}
                                            onChange={(e) => {
                                                const next = e.target.checked
                                                    ? [...updateRequestConfig.requestableFields, field.id]
                                                    : updateRequestConfig.requestableFields.filter((id) => id !== field.id);
                                                setUpdateRequestConfig({ ...updateRequestConfig, requestableFields: next });
                                            }}
                                        />
                                        <span>
                                            {field.label}
                                            <span className="ml-1 text-stone-400">({field.group})</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </SettingsSectionCard>

            <SettingsSectionCard title="Default deduction settings for new employees">
                <div className="space-y-4">
                    <SettingsToggleRow
                        id="defaultApplyStatutoryDeductions"
                        label="Apply statutory deductions by default"
                        description="PT, ESI, PF for newly created employees."
                        checked={defaultApplyStatutoryDeductions}
                        onChange={setDefaultApplyStatutoryDeductions}
                    />
                    <SettingsToggleRow
                        id="defaultApplyAttendanceDeductions"
                        label="Apply attendance deductions by default"
                        description="Late-in, early-out, and related attendance deductions for new employees."
                        checked={defaultApplyAttendanceDeductions}
                        onChange={setDefaultApplyAttendanceDeductions}
                    />
                </div>
            </SettingsSectionCard>

            <SettingsSaveBar saving={saving} onSave={handleSave} />
        </SettingsPanel>
    );
};

export default EmployeeSettings;
