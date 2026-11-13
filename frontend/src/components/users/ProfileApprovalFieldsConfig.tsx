'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Search, CheckSquare, Square, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';

export interface ProfileApprovalConfig {
  allFields: boolean;
  allowedFields: string[];
}

export interface ProfileFieldDef {
  id: string;
  label: string;
  group: string;
}

export const DEFAULT_PROFILE_FIELDS: ProfileFieldDef[] = [
  // Basic Information
  { id: 'profilePhoto', label: 'Profile Photo', group: 'Basic Information' },
  { id: 'emp_no', label: 'Employee No', group: 'Basic Information' },
  { id: 'employee_name', label: 'Employee Name', group: 'Basic Information' },
  { id: 'division_id', label: 'Division', group: 'Basic Information' },
  { id: 'department_id', label: 'Department', group: 'Basic Information' },
  { id: 'designation_id', label: 'Designation', group: 'Basic Information' },
  { id: 'doj', label: 'Date of Joining', group: 'Basic Information' },
  { id: 'proposedSalary', label: 'Gross Salary', group: 'Basic Information' },
  { id: 'second_salary', label: 'Second Salary', group: 'Basic Information' },
  { id: 'aadhaar_number', label: 'Aadhaar Number', group: 'Basic Information' },
  { id: 'employee_group_id', label: 'Employee Group', group: 'Basic Information' },

  // Personal Information
  { id: 'dob', label: 'Date of Birth', group: 'Personal Information' },
  { id: 'gender', label: 'Gender', group: 'Personal Information' },
  { id: 'marital_status', label: 'Marital Status', group: 'Personal Information' },
  { id: 'blood_group', label: 'Blood Group', group: 'Personal Information' },
  { id: 'father_name', label: 'Father Name', group: 'Personal Information' },
  { id: 'mother_name', label: 'Mother Name', group: 'Personal Information' },
  { id: 'caste', label: 'Caste', group: 'Personal Information' },
  { id: 'category', label: 'Category', group: 'Personal Information' },

  // Contact Information
  { id: 'phone', label: 'Contact Number', group: 'Contact Information' },
  { id: 'alternate_phone', label: 'Alternate Phone', group: 'Contact Information' },
  { id: 'email', label: 'Email', group: 'Contact Information' },
  { id: 'address', label: 'Present Address', group: 'Contact Information' },
  { id: 'permanent_address', label: 'Permanent Address', group: 'Contact Information' },
  { id: 'emergency_contact_name', label: 'Emergency Contact Name', group: 'Contact Information' },
  { id: 'emergency_contact_number', label: 'Emergency Contact Number', group: 'Contact Information' },

  // Bank Details
  { id: 'bank_account_no', label: 'Bank Account Number', group: 'Bank Details' },
  { id: 'bank_name', label: 'Bank Name', group: 'Bank Details' },
  { id: 'bank_place', label: 'Bank Branch / Place', group: 'Bank Details' },
  { id: 'ifsc_code', label: 'IFSC Code', group: 'Bank Details' },
  { id: 'salary_mode', label: 'Salary Mode', group: 'Bank Details' },
  { id: 'pf_number', label: 'PF Number', group: 'Bank Details' },
  { id: 'esi_number', label: 'ESI Number', group: 'Bank Details' },

  // Reporting Authority
  { id: 'reporting_authority', label: 'Reporting Authority', group: 'Reporting Authority' },

  // Qualifications
  { id: 'qualifications', label: 'Qualifications & Certificates', group: 'Qualifications' },
];

export const COMMON_FIELD_IDS = [
  'profilePhoto',
  'employee_name',
  'dob',
  'gender',
  'blood_group',
  'marital_status',
  'phone',
  'contact_number',
  'email',
  'personal_email',
  'address',
  'present_address',
  'permanent_address',
  'emergency_contact_name',
  'emergency_contact_number',
];

interface Props {
  config?: ProfileApprovalConfig;
  onChange: (next: ProfileApprovalConfig) => void;
  className?: string;
}

export default function ProfileApprovalFieldsConfig({
  config = { allFields: true, allowedFields: [] },
  onChange,
  className = '',
}: Props) {
  const [fields, setFields] = useState<ProfileFieldDef[]>(DEFAULT_PROFILE_FIELDS);
  const [searchQuery, setSearchQuery] = useState('');

  // Load fields dynamically grouped by category matching Edit Employee form settings
  useEffect(() => {
    let isMounted = true;
    const fetchFormFields = async () => {
      try {
        const res = await api.getFormSettings();
        if (!isMounted) return;
        if (res.success && res.data?.groups) {
          const loaded: ProfileFieldDef[] = [];
          const seen = new Set<string>();

          // Sort groups matching the display order of the Edit Employee form
          const sortedGroups = [...res.data.groups].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

          sortedGroups.forEach((g: any) => {
            if (g.isEnabled === false) return;
            // CRITICAL: EmployeeApplicationFormSettings uses `label` (e.g. "Basic Information"), NOT `name`
            const groupName = (g.label || g.name || g.id || 'Custom Fields').trim();

            // Profile photo is part of the employee profile (displayed at top of edit modal / basic info)
            if (g.id === 'basic_info' && !seen.has('profilePhoto')) {
              seen.add('profilePhoto');
              loaded.push({
                id: 'profilePhoto',
                label: 'Profile Photo',
                group: groupName,
              });
            }

            const sortedFields = [...(g.fields || [])]
              .filter((f: any) => f.isEnabled !== false)
              .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

            sortedFields.forEach((f: any) => {
              if (f.id && !seen.has(f.id)) {
                seen.add(f.id);
                loaded.push({
                  id: f.id,
                  label: f.label || f.id,
                  group: groupName,
                });
              }
            });

            // Employee group is rendered in basic info on Edit Employee form
            if (g.id === 'basic_info' && !seen.has('employee_group_id')) {
              seen.add('employee_group_id');
              loaded.push({
                id: 'employee_group_id',
                label: 'Employee Group',
                group: groupName,
              });
            }
          });

          // Always ensure qualifications is included under Qualifications category
          if (!seen.has('qualifications')) {
            seen.add('qualifications');
            loaded.push({
              id: 'qualifications',
              label: 'Qualifications & Certificates',
              group: 'Qualifications',
            });
          }

          if (loaded.length > 0) {
            setFields(loaded);
          }
        }
      } catch {
        // Fall back to DEFAULT_PROFILE_FIELDS
      }
    };

    fetchFormFields();
    return () => {
      isMounted = false;
    };
  }, []);

  const allFields = config.allFields !== false;
  const selectedFields = config.allowedFields || [];

  const handleToggleMode = (mode: 'all' | 'specific') => {
    if (mode === 'all') {
      onChange({ allFields: true, allowedFields: selectedFields });
    } else {
      // If switching to specific and none selected yet, default to all fields so admin can refine
      const nextAllowed = selectedFields.length > 0 ? selectedFields : fields.map((f) => f.id);
      onChange({ allFields: false, allowedFields: nextAllowed });
    }
  };

  const handleToggleField = (fieldId: string) => {
    const next = selectedFields.includes(fieldId)
      ? selectedFields.filter((id) => id !== fieldId)
      : [...selectedFields, fieldId];
    onChange({ allFields: false, allowedFields: next });
  };

  const handleSelectAll = () => {
    onChange({ allFields: false, allowedFields: fields.map((f) => f.id) });
  };

  const handleClearAll = () => {
    onChange({ allFields: false, allowedFields: [] });
  };

  const handleSelectCommon = () => {
    const availableCommon = fields.filter((f) => COMMON_FIELD_IDS.includes(f.id)).map((f) => f.id);
    onChange({ allFields: false, allowedFields: availableCommon });
  };

  const handleToggleGroup = (groupName: string, select: boolean) => {
    const groupFieldIds = fields.filter((f) => f.group === groupName).map((f) => f.id);
    let next: string[];
    if (select) {
      next = Array.from(new Set([...selectedFields, ...groupFieldIds]));
    } else {
      next = selectedFields.filter((id) => !groupFieldIds.includes(id));
    }
    onChange({ allFields: false, allowedFields: next });
  };

  // Filtered fields based on search
  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase().trim();
    return fields.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.group.toLowerCase().includes(q)
    );
  }, [fields, searchQuery]);

  // Grouped by category
  const groupedFields = useMemo(() => {
    const map = new Map<string, ProfileFieldDef[]>();
    filteredFields.forEach((f) => {
      const g = f.group || 'Other Fields';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    });
    return Array.from(map.entries());
  }, [filteredFields]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Scope Mode Selector */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer ${
            allFields
              ? 'border-purple-500 bg-purple-50/50 dark:border-purple-500 dark:bg-purple-950/20 shadow-sm'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-800/50'
          }`}
        >
          <input
            type="radio"
            name="profileApprovalMode"
            checked={allFields}
            onChange={() => handleToggleMode('all')}
            className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500"
          />
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>All Profile Fields</span>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                Default
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              User can review and approve any requested employee profile changes within their division scope.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer ${
            !allFields
              ? 'border-purple-500 bg-purple-50/50 dark:border-purple-500 dark:bg-purple-950/20 shadow-sm'
              : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:bg-slate-800/50'
          }`}
        >
          <input
            type="radio"
            name="profileApprovalMode"
            checked={!allFields}
            onChange={() => handleToggleMode('specific')}
            className="mt-1 h-4 w-4 text-purple-600 focus:ring-purple-500"
          />
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>Specific Fields Only</span>
              {!allFields && (
                <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {selectedFields.length} of {fields.length}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Restrict user to only approve specific fields selected below (e.g., Contact details, Bank info).
            </p>
          </div>
        </label>
      </div>

      {/* Field Checklist (Active when !allFields) */}
      {!allFields && (
        <div className="rounded-xl border border-purple-200/80 bg-slate-50/60 p-4 dark:border-purple-900/40 dark:bg-slate-900/30 space-y-3">
          {/* Toolbar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search profile fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={handleSelectCommon}
                className="rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300 flex items-center gap-1"
                title="Select Personal & Contact info fields"
              >
                <Sparkles className="h-3 w-3" />
                Common Fields
              </button>
            </div>
          </div>

          {/* Grouped Fields List */}
          <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
            {groupedFields.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No fields match &quot;{searchQuery}&quot;
              </div>
            ) : (
              groupedFields.map(([groupName, groupFields]) => {
                const allInGroupSelected = groupFields.every((f) => selectedFields.includes(f.id));
                const someInGroupSelected =
                  !allInGroupSelected && groupFields.some((f) => selectedFields.includes(f.id));

                return (
                  <div
                    key={groupName}
                    className="rounded-lg border border-slate-200/80 bg-white p-3 dark:border-slate-700/80 dark:bg-slate-800/50"
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleGroup(groupName, !allInGroupSelected)}
                          className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-purple-600 dark:text-slate-200 dark:hover:text-purple-400"
                        >
                          {allInGroupSelected ? (
                            <CheckSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          ) : someInGroupSelected ? (
                            <div className="h-4 w-4 rounded border-2 border-purple-600 bg-purple-100 flex items-center justify-center dark:border-purple-400 dark:bg-purple-950">
                              <div className="h-1.5 w-1.5 rounded-sm bg-purple-600 dark:bg-purple-400" />
                            </div>
                          ) : (
                            <Square className="h-4 w-4 text-slate-400" />
                          )}
                          <span>{groupName}</span>
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {groupFields.filter((f) => selectedFields.includes(f.id)).length} /{' '}
                        {groupFields.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {groupFields.map((field) => {
                        const isChecked = selectedFields.includes(field.id);
                        return (
                          <label
                            key={field.id}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? 'border-purple-300 bg-purple-50/70 text-purple-900 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200 font-medium'
                                : 'border-slate-200/80 bg-slate-50/40 text-slate-700 hover:bg-slate-100/70 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleField(field.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="truncate" title={`${field.label} (${field.id})`}>
                              {field.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Modal wrapper for Profile Approval Fields Configuration
 */
function ProfileApprovalModalContent({
  config,
  onClose,
  onSave,
  userName,
}: {
  config?: ProfileApprovalConfig;
  onClose: () => void;
  onSave: (next: ProfileApprovalConfig) => void;
  userName?: string;
}) {
  const [draftConfig, setDraftConfig] = useState<ProfileApprovalConfig>(
    config || { allFields: true, allowedFields: [] }
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 bg-gradient-to-r from-purple-50/80 to-white dark:from-purple-950/20 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Configure Profile Approval Fields
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {userName ? `Permissions for ${userName}` : 'Select fields this user can review and approve'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          <ProfileApprovalFieldsConfig config={draftConfig} onChange={setDraftConfig} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="text-xs text-slate-500">
            {draftConfig.allFields
              ? 'All profile fields permitted'
              : `${draftConfig.allowedFields.length} field(s) selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draftConfig);
                onClose();
              }}
              className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal wrapper for Profile Approval Fields Configuration
 */
export function ProfileApprovalFieldsModal({
  isOpen,
  onClose,
  config,
  onSave,
  userName,
}: {
  isOpen: boolean;
  onClose: () => void;
  config?: ProfileApprovalConfig;
  onSave: (next: ProfileApprovalConfig) => void;
  userName?: string;
}) {
  if (!isOpen) return null;

  return (
    <ProfileApprovalModalContent
      key={`${userName || 'modal'}-${isOpen}`}
      config={config}
      onClose={onClose}
      onSave={onSave}
      userName={userName}
    />
  );
}
