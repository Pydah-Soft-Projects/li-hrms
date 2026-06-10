'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';

import { SettingsSkeleton } from './SettingsSkeleton';
import { AlertCircle } from 'lucide-react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsToggleRow,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import { settingsInputClass, settingsInputStyle, settingsLedgerBorder } from '@/lib/settingsUi';

const EmployeeSettings = () => {
    const [employeeDataSource, setEmployeeDataSource] = useState<string>('mongodb');
    const [employeeDeleteTarget, setEmployeeDeleteTarget] = useState<string>('both');
    const [autoGenerateEmployeeNumber, setAutoGenerateEmployeeNumber] = useState(false);
    const [mssqlConnected, setMssqlConnected] = useState(false);
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
                setEmployeeDataSource(res.data.dataSource || 'mongodb');
                setEmployeeDeleteTarget(res.data.deleteTarget || 'both');
                setAutoGenerateEmployeeNumber(!!res.data.auto_generate_employee_number);
                setMssqlConnected(res.data.mssqlConnected || false);
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
                dataSource: employeeDataSource,
                deleteTarget: employeeDeleteTarget,
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
                subtitle="Configure data sources and deletion policies for employee records."
            />

            <SettingsSectionCard title="Storage Configuration">
                <div className="mb-6 flex items-center justify-end">
                    {mssqlConnected ? (
                        <span
                            className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight text-emerald-600"
                            style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(16,185,129,0.08)' }}
                        >
                            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            MSSQL Link Active
                        </span>
                    ) : (
                        <span
                            className="inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-tight text-stone-400"
                            style={settingsLedgerBorder}
                        >
                            <div className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                            Local Storage Only
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <SettingsField
                        label="Primary Data Source"
                        help="Determines where employee data is primarily fetched from."
                        required
                    >
                        <select
                            value={employeeDataSource}
                            onChange={(e) => setEmployeeDataSource(e.target.value)}
                            className={settingsInputClass()}
                            style={settingsInputStyle()}
                        >
                            <option value="mongodb">Internal (MongoDB)</option>
                            <option value="mssql">External (MSSQL Server)</option>
                            <option value="both">Both (Hybrid)</option>
                        </select>
                    </SettingsField>

                    <SettingsField
                        label="Deletion Policy"
                        help="Determines which systems are affected when an employee is deleted."
                        required
                    >
                        <select
                            value={employeeDeleteTarget}
                            onChange={(e) => setEmployeeDeleteTarget(e.target.value)}
                            className={settingsInputClass()}
                            style={settingsInputStyle()}
                        >
                            <option value="mongodb">Internal Only</option>
                            <option value="mssql">External Only</option>
                            <option value="both">Both Database Targets</option>
                        </select>
                    </SettingsField>

                    <div className="md:col-span-2">
                        <SettingsToggleRow
                            id="autoGenerateEmployeeNumber"
                            label="Auto generate employee number"
                            description="When ON, new employees (and bulk upload rows without a number) get the next number automatically. When OFF, employee number is required."
                            checked={autoGenerateEmployeeNumber}
                            onChange={setAutoGenerateEmployeeNumber}
                        />
                    </div>
                </div>
            </SettingsSectionCard>

            <div
                className="flex items-start gap-4 border p-6"
                style={{ ...settingsLedgerBorder, backgroundColor: 'rgba(245,158,11,0.06)' }}
            >
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <div>
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Critical: Deletion Policy</h4>
                    <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                        Setting the deletion policy to &quot;Both&quot; will permanently remove records from both MongoDB and the connected MSSQL server. This action cannot be undone.
                    </p>
                </div>
            </div>

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
                        onChange={(enabled) => setUpdateRequestConfig((prev) => ({ ...prev, enabled }))}
                    />

                    <SettingsToggleRow
                        id="allowQualifications"
                        label="Allow Qualifications Update"
                        description="When enabled, employees can request updates to their educational and professional qualifications."
                        checked={updateRequestConfig.allowQualifications}
                        onChange={(allowQualifications) => setUpdateRequestConfig((prev) => ({ ...prev, allowQualifications }))}
                    />

                    <div className="border-t pt-4" style={settingsLedgerBorder}>
                        <SettingsField label="Select Requestable Fields">
                            <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                                {allFields.map(field => (
                                    <label
                                        key={field.id}
                                        className="flex cursor-pointer items-center gap-3 border p-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
                                        style={settingsLedgerBorder}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={updateRequestConfig.requestableFields.includes(field.id)}
                                            onChange={(e) => {
                                                const fields = e.target.checked
                                                    ? [...updateRequestConfig.requestableFields, field.id]
                                                    : updateRequestConfig.requestableFields.filter(id => id !== field.id);
                                                setUpdateRequestConfig(prev => ({ ...prev, requestableFields: fields }));
                                            }}
                                            className="h-4 w-4 rounded border-stone-300 text-[color:var(--ps-accent)] focus:ring-[color:var(--ps-accent)]"
                                        />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold text-stone-700 dark:text-stone-300">{field.label}</p>
                                            <p className="truncate text-[10px] text-stone-400">{field.group}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </SettingsField>
                    </div>
                </div>
            </SettingsSectionCard>

            <SettingsSectionCard title="Default Employee Preferences">
                <div className="space-y-4">
                    <SettingsToggleRow
                        id="defaultApplyStatutoryDeductions"
                        label="Default Statutory Deductions"
                        description="Apply Profession Tax, ESI, and PF by default for new employees."
                        checked={defaultApplyStatutoryDeductions}
                        onChange={setDefaultApplyStatutoryDeductions}
                    />

                    <SettingsToggleRow
                        id="defaultApplyAttendanceDeductions"
                        label="Default Attendance Deductions"
                        description="Apply Late-in, Early-out, Permission, and Absent deductions by default for new employees."
                        checked={defaultApplyAttendanceDeductions}
                        onChange={setDefaultApplyAttendanceDeductions}
                    />
                </div>
            </SettingsSectionCard>

            <SettingsSaveBar onSave={handleSave} saving={saving} />
        </SettingsPanel>
    );
};

export default EmployeeSettings;
