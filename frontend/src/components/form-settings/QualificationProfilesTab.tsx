'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { alertSuccess, alertError, alertConfirm } from '@/lib/customSwal';
import { GraduationCap, Plus, Trash2, Copy, Pencil } from 'lucide-react';
import type { QualificationField } from './FormSettingsBuilder';
import QualificationColumnForm from '@/components/form-settings/QualificationColumnForm';
import {
  emptyQualificationColumnDraft,
  getFieldTypeLabel,
  QUALIFICATION_FIELD_GROUPS,
  slugifyFieldId,
  validateFieldConfigDraft,
  type QualificationColumnDraft,
} from '@/lib/fieldTypeConfig';
import {
  cloneQualificationsConfigForDraft,
  globalQualificationsFromFormSettings,
  QUALIFICATION_SCOPE_LABELS,
  QUALIFICATION_SCOPE_REQUIRED,
  type QualificationScopeType,
  type QualificationsConfig,
} from '@/lib/qualificationProfile';
import { settingsLedgerBorder, settingsSaveButtonClass, settingsSaveButtonStyle } from '@/lib/settingsUi';

const SCOPE_TYPE_OPTIONS = Object.entries(QUALIFICATION_SCOPE_LABELS) as Array<[QualificationScopeType, string]>;

type ProfileListItem = {
  _id: string;
  scopeType?: QualificationScopeType;
  scopeLabel?: string;
  division_id?: { _id: string; name: string } | string | null;
  department_id?: { _id: string; name: string } | string | null;
  designation_id?: { _id: string; name: string } | string | null;
  isEnabled?: boolean;
  enableCertificateUpload?: boolean;
  fields?: QualificationField[];
  defaultRows?: Record<string, unknown>[];
};

const emptyDraft = (): QualificationsConfig & { _id?: string } => ({
  isEnabled: true,
  enableCertificateUpload: false,
  fields: [],
  defaultRows: [],
});

function refName(ref: { name?: string } | string | null | undefined): string {
  if (!ref) return '—';
  if (typeof ref === 'object' && ref.name) return ref.name;
  return String(ref);
}

function refId(ref: { _id?: string } | string | null | undefined): string {
  if (!ref) return '';
  if (typeof ref === 'object' && ref._id) return String(ref._id);
  return String(ref);
}

function scopeNeeds(scopeType: QualificationScopeType, field: 'division_id' | 'department_id' | 'designation_id') {
  return QUALIFICATION_SCOPE_REQUIRED[scopeType].includes(field);
}

type Props = {
  globalQualifications?: QualificationsConfig | null;
};

export default function QualificationProfilesTab({ globalQualifications }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState<ProfileListItem[]>([]);
  const [divisions, setDivisions] = useState<Array<{ _id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ _id: string; name: string; division_id?: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ _id: string; name: string; department?: string }>>([]);
  const [scopeType, setScopeType] = useState<QualificationScopeType>('department_designation');
  const [divisionId, setDivisionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [draft, setDraft] = useState<QualificationsConfig & { _id?: string }>(emptyDraft());
  const [showAddQualField, setShowAddQualField] = useState(false);
  const [editingQualFieldId, setEditingQualFieldId] = useState<string | null>(null);
  const [newQualField, setNewQualField] = useState<QualificationColumnDraft>(emptyQualificationColumnDraft());

  const requiredFields = useMemo(() => QUALIFICATION_SCOPE_REQUIRED[scopeType], [scopeType]);

  const selectionComplete = useMemo(() => {
    if (scopeNeeds(scopeType, 'division_id') && !divisionId) return false;
    if (scopeNeeds(scopeType, 'department_id') && !departmentId) return false;
    if (scopeNeeds(scopeType, 'designation_id') && !designationId) return false;
    return true;
  }, [scopeType, divisionId, departmentId, designationId]);

  const scopedDepartments = useMemo(() => {
    if (!scopeNeeds(scopeType, 'division_id') || !divisionId) return departments;
    return departments.filter((d) => {
      const dDiv = (d as { division_id?: string | { _id?: string } }).division_id;
      const dDivId = typeof dDiv === 'object' ? dDiv?._id : dDiv;
      return !dDivId || String(dDivId) === divisionId;
    });
  }, [departments, divisionId, scopeType]);

  const scopedDesignations = useMemo(() => {
    if (!scopeNeeds(scopeType, 'department_id') || !departmentId) return designations;
    return designations.filter((d) => !d.department || String(d.department) === departmentId);
  }, [designations, departmentId, scopeType]);

  const loadMeta = useCallback(async () => {
    const [divRes, deptRes, desRes, profileRes] = await Promise.all([
      api.getDivisions(true),
      api.getDepartments(true),
      api.getAllDesignations(),
      api.listQualificationProfiles(),
    ]);
    if (divRes.success) setDivisions(divRes.data || []);
    if (deptRes.success) setDepartments(deptRes.data || []);
    if (desRes.success) setDesignations(desRes.data || []);
    if (profileRes.success) setProfiles(profileRes.data || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadMeta();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMeta]);

  const loadDraftForSelection = useCallback(async () => {
    if (!selectionComplete) {
      setDraft(emptyDraft());
      return;
    }
    const res = await api.lookupQualificationProfile({
      scopeType,
      divisionId: divisionId || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
    });
    if (res.success && res.data) {
      const p = res.data as ProfileListItem;
      setDraft({
        _id: p._id,
        isEnabled: p.isEnabled !== false,
        enableCertificateUpload: !!p.enableCertificateUpload,
        fields: p.fields || [],
        defaultRows: p.defaultRows || [],
      });
    } else {
      setDraft(emptyDraft());
    }
  }, [scopeType, divisionId, departmentId, designationId, selectionComplete]);

  useEffect(() => {
    void loadDraftForSelection();
  }, [loadDraftForSelection]);

  const handleScopeTypeChange = (next: QualificationScopeType) => {
    setScopeType(next);
    if (!scopeNeeds(next, 'division_id')) setDivisionId('');
    if (!scopeNeeds(next, 'department_id')) setDepartmentId('');
    if (!scopeNeeds(next, 'designation_id')) setDesignationId('');
  };

  const handleCopyFromGlobal = async () => {
    if (!selectionComplete) {
      alertError('Select scope first', 'Choose all required org fields for this profile type before copying.');
      return;
    }
    try {
      let source: QualificationsConfig | null = globalQualifications
        ? cloneQualificationsConfigForDraft(globalQualifications)
        : null;

      if (!source?.fields?.length) {
        const res = await api.copyQualificationProfileFromGlobal();
        if (res.success && res.data) {
          source = cloneQualificationsConfigForDraft(res.data as QualificationsConfig);
        }
      }
      if (!source?.fields?.length) {
        const settingsRes = await api.getFormSettings();
        if (settingsRes.success && settingsRes.data) {
          source = cloneQualificationsConfigForDraft(
            globalQualificationsFromFormSettings(settingsRes.data) ?? undefined
          );
        }
      }

      if (!source || (!source.fields.length && !source.defaultRows.length)) {
        alertError(
          'Nothing to copy',
          'Global default has no qualification columns yet. Open the Form fields tab, add columns under Global default qualifications, then try again.'
        );
        return;
      }

      setDraft((prev) => ({
        ...prev,
        isEnabled: source!.isEnabled,
        enableCertificateUpload: source!.enableCertificateUpload,
        fields: source!.fields,
        defaultRows: source!.defaultRows || [],
      }));
      alertSuccess(
        'Copied from global',
        `Loaded ${source.fields.length} column(s) and ${(source.defaultRows || []).length} pre-filled row(s). Click Save profile to store them.`
      );
    } catch (err: unknown) {
      alertError('Error', err instanceof Error ? err.message : 'Failed to copy global config');
    }
  };

  const handleSaveProfile = async () => {
    if (!selectionComplete) {
      alertError('Missing selection', `Complete all required fields for "${QUALIFICATION_SCOPE_LABELS[scopeType]}".`);
      return;
    }
    try {
      setSaving(true);
      const res = await api.upsertQualificationProfile({
        scopeType,
        division_id: scopeNeeds(scopeType, 'division_id') ? divisionId : null,
        department_id: scopeNeeds(scopeType, 'department_id') ? departmentId : null,
        designation_id: scopeNeeds(scopeType, 'designation_id') ? designationId : null,
        isEnabled: draft.isEnabled,
        enableCertificateUpload: draft.enableCertificateUpload,
        fields: draft.fields,
        defaultRows: draft.defaultRows || [],
      });
      if (res.success) {
        alertSuccess('Saved', `Qualification profile saved (${QUALIFICATION_SCOPE_LABELS[scopeType]}).`);
        await loadMeta();
        if (res.data?._id) setDraft((prev) => ({ ...prev, _id: res.data._id }));
      } else {
        alertError('Save failed', res.message || 'Could not save profile');
      }
    } catch (err: unknown) {
      alertError('Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!draft._id) {
      alertError('Nothing to delete', 'No saved profile for this scope selection.');
      return;
    }
    const ok = await alertConfirm('Delete profile?', 'This scope will fall back to the next matching profile or global default.');
    if (!ok) return;
    try {
      setSaving(true);
      const res = await api.deleteQualificationProfile(draft._id);
      if (res.success) {
        alertSuccess('Deleted', 'Profile removed.');
        setDraft(emptyDraft());
        await loadMeta();
      } else {
        alertError('Delete failed', res.message || 'Could not delete profile');
      }
    } catch (err: unknown) {
      alertError('Error', err instanceof Error ? err.message : 'Failed to delete profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAddQualField = () => {
    const err = validateFieldConfigDraft(newQualField);
    if (err) {
      alertError('Invalid column', err);
      return;
    }
    const id = slugifyFieldId(newQualField.label);
    const maxOrder = draft.fields.length ? Math.max(...draft.fields.map((f) => f.order ?? 0)) : 0;
    const field: QualificationField = {
      id,
      label: newQualField.label.trim(),
      type: newQualField.type,
      isRequired: newQualField.isRequired,
      isEnabled: newQualField.isEnabled,
      placeholder: newQualField.placeholder,
      validation: newQualField.validation,
      options: newQualField.options || [],
      gridRows: newQualField.gridRows,
      order: maxOrder + 1,
    };
    setDraft((prev) => ({ ...prev, fields: [...prev.fields, field] }));
    setNewQualField(emptyQualificationColumnDraft());
    setShowAddQualField(false);
  };

  const updateDraftField = (fieldId: string, patch: Partial<QualificationField>) => {
    setDraft((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
    }));
  };

  const loadProfileFromList = (p: ProfileListItem) => {
    const st = (p.scopeType || 'department_designation') as QualificationScopeType;
    setScopeType(st);
    setDivisionId(refId(p.division_id));
    setDepartmentId(refId(p.department_id));
    setDesignationId(refId(p.designation_id));
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5 dark:border-violet-900/40 dark:bg-violet-950/20">
        <div className="flex items-start gap-3">
          <GraduationCap className="mt-0.5 h-6 w-6 text-violet-600 dark:text-violet-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Scoped qualification profiles</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Configure qualifications at division, department, designation, or any combination. The system picks the most
              specific matching profile; otherwise it falls back to global default on the Form fields tab.
            </p>
            <p className="mt-2 text-xs text-violet-800 dark:text-violet-300">
              Resolution order (most specific wins): Division+Dept+Designation → Dept+Designation → Division+Designation
              → Division+Department → Designation → Department → Division → Global.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile scope type</label>
          <select
            value={scopeType}
            onChange={(e) => handleScopeTypeChange(e.target.value as QualificationScopeType)}
            className="mt-1 w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {SCOPE_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {scopeNeeds(scopeType, 'division_id') ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Division</label>
            <select
              value={divisionId}
              onChange={(e) => {
                setDivisionId(e.target.value);
                if (scopeNeeds(scopeType, 'department_id')) setDepartmentId('');
                if (scopeNeeds(scopeType, 'designation_id')) setDesignationId('');
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Select division</option>
              {divisions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {scopeNeeds(scopeType, 'department_id') ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                if (scopeNeeds(scopeType, 'designation_id')) setDesignationId('');
              }}
              disabled={scopeNeeds(scopeType, 'division_id') && !divisionId}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Select department</option>
              {scopedDepartments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {scopeNeeds(scopeType, 'designation_id') ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
            <select
              value={designationId}
              onChange={(e) => setDesignationId(e.target.value)}
              disabled={scopeNeeds(scopeType, 'department_id') && !departmentId}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Select designation</option>
              {scopedDesignations.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={() => void handleCopyFromGlobal()}
            disabled={!selectionComplete}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            <Copy className="h-4 w-4" />
            Copy global
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={saving || !selectionComplete}
            className={settingsSaveButtonClass()}
            style={settingsSaveButtonStyle()}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {draft._id ? (
            <button
              type="button"
              onClick={() => void handleDeleteProfile()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {selectionComplete ? (
        <div
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900/40"
          style={settingsLedgerBorder}
        >
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isEnabled !== false}
                onChange={(e) => setDraft((prev) => ({ ...prev, isEnabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-violet-600"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable qualifications</span>
            </label>
            {draft.isEnabled !== false && (
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!draft.enableCertificateUpload}
                  onChange={(e) => setDraft((prev) => ({ ...prev, enableCertificateUpload: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable certificate upload</span>
              </label>
            )}
          </div>

          {draft.isEnabled !== false && (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Table columns</h4>
                <button
                  type="button"
                  onClick={() => setShowAddQualField(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add column
                </button>
              </div>

              {draft.fields.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                        <th className="px-3 py-2">Label</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Enabled</th>
                        <th className="px-3 py-2">Required</th>
                        <th className="px-3 py-2 w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...draft.fields]
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((field) =>
                          editingQualFieldId === field.id ? (
                            <tr key={field.id} className="border-b border-slate-100 bg-violet-50/40 dark:border-slate-800">
                              <td colSpan={5} className="p-4">
                                <QualificationColumnForm
                                  mode="edit"
                                  draft={{
                                    label: field.label,
                                    type: field.type,
                                    isRequired: !!field.isRequired,
                                    isEnabled: field.isEnabled !== false,
                                    placeholder: field.placeholder || '',
                                    validation: field.validation,
                                    options: field.options || [],
                                    gridRows: field.gridRows,
                                  }}
                                  onChange={(colDraft) =>
                                    updateDraftField(field.id, {
                                      label: colDraft.label,
                                      type: colDraft.type,
                                      isRequired: colDraft.isRequired,
                                      placeholder: colDraft.placeholder,
                                      validation: colDraft.validation,
                                      options: colDraft.options,
                                      gridRows: colDraft.gridRows,
                                    })
                                  }
                                />
                                <div className="mt-3 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingQualFieldId(null)}
                                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white"
                                  >
                                    Done
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={field.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="px-3 py-2 font-medium">{field.label}</td>
                              <td className="px-3 py-2">{getFieldTypeLabel(QUALIFICATION_FIELD_GROUPS, field.type)}</td>
                              <td className="px-3 py-2">{field.isEnabled !== false ? 'Yes' : 'No'}</td>
                              <td className="px-3 py-2">{field.isRequired ? 'Yes' : 'No'}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingQualFieldId(field.id)}
                                    className="text-xs font-medium text-violet-600 hover:underline"
                                  >
                                    <Pencil className="inline h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDraft((prev) => ({
                                        ...prev,
                                        fields: prev.fields.filter((f) => f.id !== field.id),
                                      }))
                                    }
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No columns yet. Add columns or copy from global.</p>
              )}

              {draft.fields.filter((f) => f.isEnabled !== false).length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Pre-filled rows</h4>
                  <p className="mb-3 text-xs text-slate-500">
                    These rows appear read-only for applicants. They can still add their own rows below.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                          <th className="w-12 px-3 py-2">S.No</th>
                          {[...draft.fields]
                            .filter((f) => f.isEnabled !== false)
                            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                            .map((f) => (
                              <th key={f.id} className="px-3 py-2">
                                {f.label}
                              </th>
                            ))}
                          <th className="w-16 px-3 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(draft.defaultRows || []).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="px-3 py-2">{rowIndex + 1}</td>
                            {[...draft.fields]
                              .filter((f) => f.isEnabled !== false)
                              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                              .map((f) => (
                                <td key={f.id} className="px-3 py-2">
                                  {f.type === 'boolean' ? (
                                    <input
                                      type="checkbox"
                                      checked={!!row[f.id]}
                                      onChange={(e) => {
                                        const rows = [...(draft.defaultRows || [])];
                                        if (!rows[rowIndex]) rows[rowIndex] = {};
                                        rows[rowIndex] = { ...rows[rowIndex], [f.id]: e.target.checked };
                                        setDraft((prev) => ({ ...prev, defaultRows: rows }));
                                      }}
                                    />
                                  ) : f.type === 'select' || f.type === 'radio' ? (
                                    <select
                                      value={row[f.id] != null ? String(row[f.id]) : ''}
                                      onChange={(e) => {
                                        const rows = [...(draft.defaultRows || [])];
                                        if (!rows[rowIndex]) rows[rowIndex] = {};
                                        rows[rowIndex] = { ...rows[rowIndex], [f.id]: e.target.value };
                                        setDraft((prev) => ({ ...prev, defaultRows: rows }));
                                      }}
                                      className="w-full min-w-0 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                                    >
                                      <option value="">Select</option>
                                      {(f.options || []).map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={f.id === 'month_year_of_pass' ? 'month' : f.type === 'number' ? 'number' : 'text'}
                                      value={row[f.id] != null ? String(row[f.id]) : ''}
                                      onChange={(e) => {
                                        const rows = [...(draft.defaultRows || [])];
                                        if (!rows[rowIndex]) rows[rowIndex] = {};
                                        const val =
                                          f.type === 'number'
                                            ? parseFloat(e.target.value) || 0
                                            : f.id === 'month_year_of_pass' && e.target.value
                                              ? `${e.target.value}-01`
                                              : e.target.value;
                                        rows[rowIndex] = { ...rows[rowIndex], [f.id]: val };
                                        setDraft((prev) => ({ ...prev, defaultRows: rows }));
                                      }}
                                      className="w-full min-w-0 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                                    />
                                  )}
                                </td>
                              ))}
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const rows = (draft.defaultRows || []).filter((_, i) => i !== rowIndex);
                                  setDraft((prev) => ({ ...prev, defaultRows: rows }));
                                }}
                                className="text-xs text-red-600 hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const qualFields = [...draft.fields].filter((f) => f.isEnabled !== false);
                      const newRow = qualFields.reduce(
                        (acc, f) => {
                          acc[f.id] = f.type === 'number' ? 0 : f.type === 'boolean' ? false : '';
                          return acc;
                        },
                        {} as Record<string, unknown>
                      );
                      setDraft((prev) => ({ ...prev, defaultRows: [...(prev.defaultRows || []), newRow] }));
                    }}
                    className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                  >
                    Add pre-filled row
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Select scope type and required org fields to edit a profile.
        </p>
      )}

      <div>
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Saved profiles ({profiles.length})
        </h4>
        {profiles.length === 0 ? (
          <p className="text-sm text-slate-500">No scoped profiles yet. Global default applies everywhere.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <th className="px-3 py-2">Scope</th>
                  <th className="px-3 py-2">Division</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Designation</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Columns</th>
                  <th className="px-3 py-2">Default rows</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr
                    key={p._id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    onClick={() => loadProfileFromList(p)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {p.scopeLabel || QUALIFICATION_SCOPE_LABELS[p.scopeType as QualificationScopeType] || p.scopeType}
                    </td>
                    <td className="px-3 py-2">{refName(p.division_id)}</td>
                    <td className="px-3 py-2">{refName(p.department_id)}</td>
                    <td className="px-3 py-2">{refName(p.designation_id)}</td>
                    <td className="px-3 py-2">{p.isEnabled !== false ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">{p.fields?.length || 0}</td>
                    <td className="px-3 py-2">{p.defaultRows?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddQualField && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAddQualField(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">New qualification column</h3>
            <p className="mt-1 text-sm text-slate-500">Same builder as Form fields — Google Forms–style types with validation.</p>
            <div className="mt-4">
              <QualificationColumnForm draft={newQualField} onChange={setNewQualField} mode="add" />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddQualField(false)} className="rounded-lg border px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddQualField}
                disabled={!!validateFieldConfigDraft(newQualField)}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
