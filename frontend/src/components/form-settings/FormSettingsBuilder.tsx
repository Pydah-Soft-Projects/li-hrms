'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { alertSuccess, alertError, alertConfirm } from '@/lib/customSwal';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  GripVertical,
  Save,
  X,
  HelpCircle,
  Layers,
  GraduationCap,
  Shield,
  Pencil,
} from 'lucide-react';

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'email' | 'tel' | 'file' | 'array' | 'object' | 'userselect';
  dataType: string;
  placeholder?: string;
  options?: Array<{ label: string; value: any }>;
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number; pattern?: string; custom?: string; maxItems?: number };
  isRequired: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  order: number;
  itemType?: string;
  itemSchema?: any;
  description?: string;
}

export interface FormGroup {
  id: string;
  label: string;
  description?: string;
  order: number;
  isSystem: boolean;
  isEnabled: boolean;
  fields: FormField[];
}

/** Qualification field from API (id, label, type, placeholder, validation, options, order, etc.) */
export interface QualificationField {
  id: string;
  label: string;
  type: string;
  isRequired?: boolean;
  isEnabled?: boolean;
  placeholder?: string;
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number };
  options?: Array<{ label: string; value: string }>;
  order?: number;
  _id?: string;
}

export interface FormSettings {
  _id?: string;
  groups: FormGroup[];
  qualifications?: {
    isEnabled?: boolean;
    enableCertificateUpload?: boolean;
    fields?: QualificationField[];
  };
  version?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const QUESTION_TYPES: { value: FormField['type']; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Checkboxes' },
  { value: 'file', label: 'File upload' },
  { value: 'userselect', label: 'Choose from list (person)' },
  { value: 'array', label: 'List of items' },
  { value: 'object', label: 'Group of fields' },
];

function getQuestionTypeLabel(type: string): string {
  return QUESTION_TYPES.find((t) => t.value === type)?.label || type;
}

const QUAL_FIELD_TYPES = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
];

function getQualTypeLabel(type: string): string {
  return QUAL_FIELD_TYPES.find((t) => t.value === type)?.label || type;
}

function formatQualValidation(v: QualificationField['validation'], type: string): string | null {
  if (!v) return null;
  if (type === 'number' && (v.min != null || v.max != null)) {
    if (v.min != null && v.max != null) return `${v.min}–${v.max}`;
    if (v.min != null) return `≥ ${v.min}`;
    if (v.max != null) return `≤ ${v.max}`;
  }
  if ((type === 'text' || type === 'textarea') && (v.minLength != null || v.maxLength != null)) {
    if (v.minLength != null && v.maxLength != null) return `${v.minLength}–${v.maxLength} chars`;
    if (v.minLength != null) return `min ${v.minLength} chars`;
    if (v.maxLength != null) return `max ${v.maxLength} chars`;
  }
  return null;
}

export default function FormSettingsBuilder() {
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<{ groupId: string; fieldId: string } | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState<string | null>(null);
  const [newSection, setNewSection] = useState({ label: '', description: '' });
  const [newQuestion, setNewQuestion] = useState<Partial<FormField>>({
    label: '',
    type: 'text',
    dataType: 'string',
    isRequired: false,
    isEnabled: true,
    placeholder: '',
    order: 0,
  });
  const [newOption, setNewOption] = useState('');
  const [editingQualFieldId, setEditingQualFieldId] = useState<string | null>(null);
  const [showAddQualField, setShowAddQualField] = useState(false);
  const [newQualField, setNewQualField] = useState<{
    id: string;
    label: string;
    type: string;
    isRequired: boolean;
    isEnabled: boolean;
    placeholder: string;
    order: number;
    validation?: { minLength?: number; maxLength?: number; min?: number; max?: number };
  }>({
    id: '',
    label: '',
    type: 'text',
    isRequired: false,
    isEnabled: true,
    placeholder: '',
    order: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.getFormSettings();
      const data = (response && (response as any).data !== undefined) ? (response as any).data : response;
      const success = (response && (response as any).success !== undefined) ? (response as any).success : true;
      if (data && (data.groups || Array.isArray(data.groups))) {
        setSettings(data as FormSettings);
        setExpandedSections(new Set((data.groups || []).map((g: FormGroup) => g.id)));
      } else if (!success || !data) {
        const initResponse = await api.initializeFormSettings();
        const initData = (initResponse && (initResponse as any).data !== undefined) ? (initResponse as any).data : initResponse;
        if (initData && (initData.groups || Array.isArray(initData.groups))) {
          setSettings(initData as FormSettings);
          setExpandedSections(new Set((initData.groups || []).map((g: FormGroup) => g.id)));
        } else {
          alertError('Failed to load', 'Could not load form. Please try again.');
        }
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to load form settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (id: string) => {
    const next = new Set(expandedSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSections(next);
  };

  const handleAddSection = async () => {
    if (!newSection.label.trim()) {
      alertError('Required', 'Section title is required');
      return;
    }
    try {
      setSaving(true);
      const id = newSection.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const maxOrder = settings?.groups?.length ? Math.max(...settings.groups.map((g) => g.order)) : 0;
      const response = await api.addFormGroup({
        id,
        label: newSection.label,
        description: newSection.description || '',
        order: maxOrder + 1,
        isSystem: false,
        isEnabled: true,
        fields: [],
      });
      if (response.success) {
        await loadSettings();
        setShowAddSection(false);
        setNewSection({ label: '', description: '' });
        alertSuccess('Section added', 'The section was created successfully.');
      } else {
        alertError('Failed to add section', response.message || 'Could not add section.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to add section');
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = async (groupId: string) => {
    if (!newQuestion.label?.trim()) {
      alertError('Required', 'Question is required');
      return;
    }
    const group = settings?.groups?.find((g) => g.id === groupId);
    if (!group) return;
    try {
      setSaving(true);
      const fieldId = newQuestion.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const maxOrder = group.fields.length ? Math.max(...group.fields.map((f) => f.order)) : 0;
      let dataType: string = 'string';
      if (newQuestion.type === 'number') dataType = 'number';
      else if (newQuestion.type === 'date') dataType = 'date';
      else if (newQuestion.type === 'array') dataType = 'array';
      else if (newQuestion.type === 'object') dataType = 'object';
      else if (newQuestion.type === 'userselect') dataType = 'array';

      const fieldData = {
        id: fieldId,
        label: newQuestion.label,
        type: newQuestion.type,
        dataType,
        placeholder: newQuestion.placeholder || '',
        isRequired: newQuestion.isRequired || false,
        isSystem: false,
        isEnabled: newQuestion.isEnabled !== false,
        order: maxOrder + 1,
        options: (newQuestion.type === 'select' || newQuestion.type === 'multiselect') ? (newQuestion.options || []) : undefined,
        validation: newQuestion.validation,
      };

      const response = await api.addFormField(groupId, fieldData);
      if (response.success) {
        await loadSettings();
        setShowAddQuestion(null);
        setNewQuestion({ label: '', type: 'text', dataType: 'string', isRequired: false, isEnabled: true, order: 0, placeholder: '' });
        setNewOption('');
        alertSuccess('Question added', 'The question was added to this section.');
      } else {
        alertError('Failed to add question', response.message || 'Could not add question.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to add question');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSection = async (groupId: string, updates: Partial<FormGroup>) => {
    try {
      setSaving(true);
      const response = await api.updateFormGroup(groupId, updates);
      if (response.success) {
        await loadSettings();
        setEditingSection(null);
        alertSuccess('Section updated', 'Changes were saved.');
      } else {
        alertError('Failed to update section', response.message || 'Could not update section.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to update section');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateQuestion = async (groupId: string, fieldId: string, updates: Partial<FormField>) => {
    try {
      setSaving(true);
      const response = await api.updateFormField(groupId, fieldId, updates);
      if (response.success) {
        await loadSettings();
        setEditingQuestion(null);
        alertSuccess('Question updated', 'Changes were saved.');
      } else {
        alertError('Failed to update question', response.message || 'Could not update question.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to update question');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSection = async (groupId: string) => {
    const group = settings?.groups?.find((g) => g.id === groupId);
    if (group?.isSystem) {
      alertError('Cannot delete', 'This section cannot be deleted.');
      return;
    }
    const confirmed = await alertConfirm('Delete section?', `Delete "${group?.label}"? All questions in it will be removed.`, 'Delete');
    if (!confirmed.isConfirmed) return;
    try {
      setSaving(true);
      const response = await api.deleteFormGroup(groupId);
      if (response.success) {
        await loadSettings();
        alertSuccess('Section deleted', 'The section was removed.');
      } else {
        alertError('Failed to delete section', response.message || 'Could not delete section.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to delete section');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (groupId: string, fieldId: string) => {
    const field = settings?.groups?.find((g) => g.id === groupId)?.fields?.find((f) => f.id === fieldId);
    if (field?.isSystem) {
      alertError('Cannot delete', 'This question cannot be deleted.');
      return;
    }
    const confirmed = await alertConfirm('Delete question?', `Delete "${field?.label}"?`, 'Delete');
    if (!confirmed.isConfirmed) return;
    try {
      setSaving(true);
      const response = await api.deleteFormField(groupId, fieldId);
      if (response.success) {
        await loadSettings();
        setEditingQuestion(null);
        alertSuccess('Question deleted', 'The question was removed.');
      } else {
        alertError('Failed to delete question', response.message || 'Could not delete question.');
      }
    } catch (error: any) {
      alertError('Error', error.message || 'Failed to delete question');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-red-700 dark:text-red-300">Could not load form settings.</p>
        <button onClick={loadSettings} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
          Retry
        </button>
      </div>
    );
  }

  const sortedGroups = [...(settings.groups || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="w-full space-y-8 rounded-2xl bg-slate-50/60 p-6 dark:bg-slate-900/30 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-white">Form builder</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure sections and questions for the employee application form.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddSection(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <Plus className="h-4 w-4" />
          Add section
        </button>
      </div>

      {/* Add Section modal */}
      {showAddSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4" onClick={() => setShowAddSection(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">New section</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sections group related questions (e.g. Personal info, Contact).</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Section title</label>
                <input
                  type="text"
                  value={newSection.label}
                  onChange={(e) => setNewSection({ ...newSection, label: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  placeholder="e.g. Personal information"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Description (optional)</label>
                <input
                  type="text"
                  value={newSection.description}
                  onChange={(e) => setNewSection({ ...newSection, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  placeholder="Brief description for this section"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAddSection(false); setNewSection({ label: '', description: '' }); }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSection}
                disabled={saving || !newSection.label.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {sortedGroups.map((group) => (
          <div
            key={group.id}
            className="overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-sm dark:border-slate-700/50 dark:bg-slate-900/80"
          >
            {/* Section header */}
            <div
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
              onClick={() => toggleSection(group.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-slate-400">
                  {expandedSections.has(group.id) ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium text-slate-900 dark:text-white truncate">{group.label}</h3>
                  {group.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{group.description}</p>
                  )}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {group.fields?.length ?? 0} question{(group.fields?.length ?? 0) !== 1 ? 's' : ''}
                    {group.isSystem && ' · Built-in'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {/* Add question: allowed for all groups including system */}
                <button
                  type="button"
                  onClick={() => {
                    setShowAddQuestion(group.id);
                    setNewQuestion({
                      label: '',
                      type: 'text',
                      dataType: 'string',
                      isRequired: false,
                      isEnabled: true,
                      placeholder: '',
                      order: 0,
                    });
                    setNewOption('');
                    if (!expandedSections.has(group.id)) setExpandedSections(prev => new Set(prev).add(group.id));
                  }}
                  className="rounded-xl p-2 text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/30"
                  title="Add question"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {!group.isSystem && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingSection(group.id)}
                      className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                      title="Edit section"
                    >
                      <Layers className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(group.id)}
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-800 dark:hover:text-red-400"
                      title="Delete section"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Edit section inline */}
            {editingSection === group.id && (
              <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/30">
                <div className="flex flex-col gap-3 max-w-md">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Section title</label>
                    <input
                      type="text"
                      value={group.label}
                      onChange={(e) => {
                        const next = settings.groups.map((g) => (g.id === group.id ? { ...g, label: e.target.value } : g));
                        setSettings({ ...settings, groups: next });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
                    <input
                      type="text"
                      value={group.description || ''}
                      onChange={(e) => {
                        const next = settings.groups.map((g) => (g.id === group.id ? { ...g, description: e.target.value } : g));
                        setSettings({ ...settings, groups: next });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateSection(group.id, { label: group.label, description: group.description })}
                      disabled={saving}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingSection(null); loadSettings(); }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Section content: questions */}
            {expandedSections.has(group.id) && (
              <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
                {/* Add question form */}
                {showAddQuestion === group.id && (
                  <div className="mb-6 rounded-2xl border border-violet-100 bg-violet-50/50 p-5 dark:border-violet-900/30 dark:bg-violet-900/10">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">New question</h4>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Question</label>
                        <input
                          type="text"
                          value={newQuestion.label || ''}
                          onChange={(e) => setNewQuestion({ ...newQuestion, label: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          placeholder="e.g. Full name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Description / help text (optional)</label>
                        <input
                          type="text"
                          value={newQuestion.placeholder || ''}
                          onChange={(e) => setNewQuestion({ ...newQuestion, placeholder: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          placeholder="Shown below the question"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Question type</label>
                        <select
                          value={newQuestion.type || 'text'}
                          onChange={(e) => {
                            const type = e.target.value as FormField['type'];
                            let dataType = 'string';
                            if (type === 'number') dataType = 'number';
                            else if (type === 'date') dataType = 'date';
                            else if (type === 'array') dataType = 'array';
                            else if (type === 'object') dataType = 'object';
                            else if (type === 'userselect') dataType = 'array';
                            setNewQuestion({ ...newQuestion, type, dataType, options: (type === 'select' || type === 'multiselect') ? (newQuestion.options || []) : undefined });
                          }}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          {QUESTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newQuestion.isRequired || false}
                            onChange={(e) => setNewQuestion({ ...newQuestion, isRequired: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Required</span>
                        </label>
                      </div>
                      {(newQuestion.type === 'select' || newQuestion.type === 'multiselect') && (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Options</label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(newQuestion.options || []).map((opt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-sm dark:bg-slate-700"
                              >
                                {opt.label}
                                <button
                                  type="button"
                                  onClick={() => setNewQuestion({ ...newQuestion, options: (newQuestion.options || []).filter((_, j) => j !== i) })}
                                  className="rounded p-0.5 hover:bg-slate-300 dark:hover:bg-slate-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={newOption}
                              onChange={(e) => setNewOption(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (newOption.trim()) {
                                    setNewQuestion({ ...newQuestion, options: [...(newQuestion.options || []), { label: newOption.trim(), value: newOption.trim() }] });
                                    setNewOption('');
                                  }
                                }
                              }}
                              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              placeholder="Add option"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (newOption.trim()) {
                                  setNewQuestion({ ...newQuestion, options: [...(newQuestion.options || []), { label: newOption.trim(), value: newOption.trim() }] });
                                  setNewOption('');
                                }
                              }}
                              className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
                            >
                              Add option
                            </button>
                          </div>
                        </div>
                      )}
                      {(newQuestion.type === 'text' || newQuestion.type === 'textarea' || newQuestion.type === 'email' || newQuestion.type === 'tel') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Min length</label>
                            <input
                              type="number"
                              min={0}
                              value={newQuestion.validation?.minLength ?? ''}
                              onChange={(e) => {
                                const v = e.target.value ? Number(e.target.value) : undefined;
                                setNewQuestion({ ...newQuestion, validation: { ...newQuestion.validation, minLength: v } });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              placeholder="Optional"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Max length</label>
                            <input
                              type="number"
                              min={0}
                              value={newQuestion.validation?.maxLength ?? ''}
                              onChange={(e) => {
                                const v = e.target.value ? Number(e.target.value) : undefined;
                                setNewQuestion({ ...newQuestion, validation: { ...newQuestion.validation, maxLength: v } });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              placeholder="Optional"
                            />
                          </div>
                        </div>
                      )}
                      {newQuestion.type === 'number' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Min value</label>
                            <input
                              type="number"
                              value={newQuestion.validation?.min ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? undefined : Number(e.target.value);
                                setNewQuestion({ ...newQuestion, validation: { ...newQuestion.validation, min: v } });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Max value</label>
                            <input
                              type="number"
                              value={newQuestion.validation?.max ?? ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? undefined : Number(e.target.value);
                                setNewQuestion({ ...newQuestion, validation: { ...newQuestion.validation, max: v } });
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddQuestion(group.id)}
                        disabled={saving || !newQuestion.label?.trim()}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {saving ? 'Adding…' : 'Add question'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddQuestion(null); setNewOption(''); }}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Questions list - cards in grid (2–3 per row); edit opens inside that card only */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {(group.fields || [])
                    .sort((a, b) => a.order - b.order)
                    .map((field) => {
                      const isEditingThis = editingQuestion?.groupId === group.id && editingQuestion?.fieldId === field.id;
                      return (
                      <div
                        key={field.id}
                        className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-800/50 dark:shadow-slate-900/30 dark:hover:shadow-slate-900/40 ${isEditingThis ? 'sm:col-span-2 xl:col-span-3' : ''}`}
                      >
                        {isEditingThis ? (
                          /* Edit form inside this card only */
                          <div className="p-5">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Edit question</h4>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Question</label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => {
                              const next = settings.groups.map((g) =>
                                g.id === group.id
                                  ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, label: e.target.value } : f)) }
                                  : g
                              );
                              setSettings({ ...settings, groups: next });
                            }}
                            disabled={field.isSystem}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Description / help text</label>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) => {
                              const next = settings.groups.map((g) =>
                                g.id === group.id
                                  ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, placeholder: e.target.value } : f)) }
                                  : g
                              );
                              setSettings({ ...settings, groups: next });
                            }}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            placeholder="Optional"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.isRequired || false}
                              onChange={(e) => {
                                const next = settings.groups.map((g) =>
                                  g.id === group.id
                                    ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, isRequired: e.target.checked } : f)) }
                                    : g
                                );
                                setSettings({ ...settings, groups: next });
                              }}
                              disabled={field.isSystem}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Required</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.isEnabled !== false}
                              onChange={(e) => {
                                const next = settings.groups.map((g) =>
                                  g.id === group.id
                                    ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, isEnabled: e.target.checked } : f)) }
                                    : g
                                );
                                setSettings({ ...settings, groups: next });
                              }}
                              disabled={field.isSystem}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Enabled</span>
                          </label>
                        </div>
                        {(field.type === 'select' || field.type === 'multiselect') && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Options</label>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {(field.options || []).map((opt, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-sm dark:bg-slate-700">
                                  {opt.label}
                                  {!field.isSystem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const opts = (field.options || []).filter((_, j) => j !== i);
                                        const next = settings.groups.map((g) =>
                                          g.id === group.id ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, options: opts } : f)) } : g
                                        );
                                        setSettings({ ...settings, groups: next });
                                      }}
                                      className="rounded p-0.5 hover:bg-slate-300 dark:hover:bg-slate-600"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                            {!field.isSystem && (
                              <div className="mt-2 flex gap-2">
                                <input
                                  type="text"
                                  id={`add-opt-${field.id}`}
                                  placeholder="Add option"
                                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                  onKeyDown={(e) => {
                                    const input = e.target as HTMLInputElement;
                                    if (e.key === 'Enter' && input.value.trim()) {
                                      const opts = [...(field.options || []), { label: input.value.trim(), value: input.value.trim() }];
                                      const next = settings.groups.map((g) =>
                                        g.id === group.id ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, options: opts } : f)) } : g
                                      );
                                      setSettings({ ...settings, groups: next });
                                      input.value = '';
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.getElementById(`add-opt-${field.id}`) as HTMLInputElement;
                                    if (input?.value.trim()) {
                                      const opts = [...(field.options || []), { label: input.value.trim(), value: input.value.trim() }];
                                      const next = settings.groups.map((g) =>
                                        g.id === group.id ? { ...g, fields: g.fields.map((f) => (f.id === field.id ? { ...f, options: opts } : f)) } : g
                                      );
                                      setSettings({ ...settings, groups: next });
                                      input.value = '';
                                    }
                                  }}
                                  className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-white"
                                >
                                  Add option
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const f = settings?.groups?.find((g) => g.id === group.id)?.fields?.find((x) => x.id === field.id);
                            if (f) {
                              handleUpdateQuestion(group.id, field.id, {
                                label: f.label,
                                placeholder: f.placeholder,
                                isRequired: f.isRequired,
                                isEnabled: f.isEnabled,
                                options: f.options,
                              });
                            }
                          }}
                          disabled={saving}
                          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingQuestion(null); loadSettings(); }}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                          </div>
                        ) : (
                          /* View mode - same card */
                          <div className="flex items-start gap-4 p-5">
                            <span className="text-slate-300 dark:text-slate-500 mt-1 shrink-0"><GripVertical className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-800 dark:text-white">{field.label}</span>
                                {field.isRequired && (
                                  <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Required</span>
                                )}
                                {field.isSystem && (
                                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300 inline-flex items-center gap-1">
                                    <Shield className="h-3 w-3" /> Built-in
                                  </span>
                                )}
                              </div>
                              {field.placeholder && (
                                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <HelpCircle className="h-3.5 w-3 shrink-0" /> {field.placeholder}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{getQuestionTypeLabel(field.type)}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {!field.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => setEditingQuestion({ groupId: group.id, fieldId: field.id })}
                                  className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
                                  title="Edit question"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {!field.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion(group.id, field.id)}
                                  className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400 transition-colors"
                                  title="Delete question"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                    })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Qualifications / Education & credentials */}
      {settings.qualifications && (
        <div className="rounded-2xl border border-slate-100 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-900/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Education & qualifications</h3>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Credential fields shown in the form (e.g. Degree, Year).</p>
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.qualifications.isEnabled !== false}
                      onChange={async (e) => {
                        try {
                          await api.updateQualificationsConfig({ isEnabled: e.target.checked });
                          await loadSettings();
                          alertSuccess('Qualifications', 'Qualifications section updated.');
                        } catch (err: any) {
                          alertError('Error', err.message || 'Failed to update');
                        }
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Enable qualifications</span>
                  </label>
                  {settings.qualifications.isEnabled !== false && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.qualifications.enableCertificateUpload || false}
                        onChange={async (e) => {
                          try {
                            await api.updateQualificationsConfig({ enableCertificateUpload: e.target.checked });
                            await loadSettings();
                            alertSuccess('Certificate upload', 'Setting updated.');
                          } catch (err: any) {
                            alertError('Error', err.message || 'Failed to update');
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Allow certificate upload</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
            {settings.qualifications.isEnabled !== false && (
              <button
                type="button"
                onClick={() => {
                  setShowAddQualField(true);
                  setNewQualField({
                    id: `qual_${Date.now()}`,
                    label: '',
                    type: 'text',
                    isRequired: false,
                    isEnabled: true,
                    placeholder: '',
                    order: (settings.qualifications?.fields?.length ?? 0) + 1,
                  });
                }}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              >
                <Plus className="h-4 w-4" />
                Add qualification field
              </button>
            )}
          </div>

          {settings.qualifications.isEnabled !== false && (
            <>
              {/* Add qualification field form */}
              {showAddQualField && (
                <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/50 p-5 dark:border-violet-900/30 dark:bg-violet-900/10">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-white">New qualification field</h4>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Field name</label>
                        <input
                          type="text"
                          value={newQualField.label}
                          onChange={(e) => setNewQualField({ ...newQualField, label: e.target.value, id: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || newQualField.id })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          placeholder="e.g. Degree"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">ID</label>
                        <input
                          type="text"
                          value={newQualField.id}
                          onChange={(e) => setNewQualField({ ...newQualField, id: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          placeholder="e.g. degree"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
                        <select
                          value={newQualField.type}
                          onChange={(e) => setNewQualField({ ...newQualField, type: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          {QUAL_FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newQualField.isRequired}
                            onChange={(e) => setNewQualField({ ...newQualField, isRequired: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-slate-600 dark:text-slate-300">Required</span>
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Placeholder (optional)</label>
                        <input
                          type="text"
                          value={newQualField.placeholder}
                          onChange={(e) => setNewQualField({ ...newQualField, placeholder: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          placeholder="e.g. E.g., B.Tech, MBA or E.g., 2020"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newQualField.label.trim() || !newQualField.id.trim()) {
                            alertError('Required', 'Field name and ID are required.');
                            return;
                          }
                          try {
                            setSaving(true);
                            const validation =
                              newQualField.type === 'number'
                                ? { min: 1900, max: 2100 }
                                : (newQualField.type === 'text' || newQualField.type === 'textarea')
                                  ? { minLength: 2, maxLength: 100 }
                                  : undefined;
                            await api.addQualificationsField({
                              id: newQualField.id,
                              label: newQualField.label,
                              type: newQualField.type,
                              isRequired: newQualField.isRequired,
                              isEnabled: newQualField.isEnabled,
                              placeholder: newQualField.placeholder.trim() || undefined,
                              validation: newQualField.validation ?? validation,
                              order: newQualField.order,
                            });
                            await loadSettings();
                            setShowAddQualField(false);
                            setNewQualField({ id: '', label: '', type: 'text', isRequired: false, isEnabled: true, placeholder: '', order: 0 });
                            alertSuccess('Qualification field added', 'The field was added.');
                          } catch (err: any) {
                            alertError('Failed to add field', err.message || 'Could not add field.');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {saving ? 'Adding…' : 'Add field'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddQualField(false); setNewQualField({ id: '', label: '', type: 'text', isRequired: false, isEnabled: true, placeholder: '', order: 0 }); }}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* List of qualification fields */}
              <div className="mt-6">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Credential fields</h4>
                {(settings.qualifications.fields && settings.qualifications.fields.length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...(settings.qualifications.fields)]
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((field) => {
                        const validationHint = formatQualValidation(field.validation, field.type);
                        const isEditingThis = editingQualFieldId === field.id;
                        const updateQualFieldInSettings = (updates: Partial<QualificationField>) => {
                          setSettings(prev => {
                            if (!prev?.qualifications?.fields) return prev;
                            return {
                              ...prev,
                              qualifications: {
                                ...prev.qualifications!,
                                fields: prev.qualifications.fields.map(f => f.id === field.id ? { ...f, ...updates } : f),
                              },
                            };
                          });
                        };
                        return (
                        <div
                          key={field._id ?? field.id}
                          className={`rounded-2xl border border-slate-200/80 bg-white shadow-md shadow-slate-200/50 transition-shadow hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-800/50 dark:shadow-slate-900/30 dark:hover:shadow-slate-900/40 ${isEditingThis ? 'sm:col-span-2 xl:col-span-3' : ''}`}
                        >
                          {isEditingThis ? (
                            <div className="p-5">
                              <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Edit qualification field</h4>
                              <div className="mt-4 space-y-4">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Field name</label>
                                  <input
                                    type="text"
                                    value={field.label}
                                    onChange={(e) => updateQualFieldInSettings({ label: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                    placeholder="e.g. Degree"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
                                  <select
                                    value={field.type}
                                    onChange={(e) => updateQualFieldInSettings({ type: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                  >
                                    {QUAL_FIELD_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Placeholder (optional)</label>
                                  <input
                                    type="text"
                                    value={field.placeholder || ''}
                                    onChange={(e) => updateQualFieldInSettings({ placeholder: e.target.value })}
                                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                    placeholder="e.g. E.g., B.Tech, MBA"
                                  />
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={field.isRequired || false}
                                    onChange={(e) => updateQualFieldInSettings({ isRequired: e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                  />
                                  <span className="text-sm text-slate-600 dark:text-slate-300">Required</span>
                                </label>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      setSaving(true);
                                      await api.updateQualificationsField(field.id, {
                                        label: field.label,
                                        type: field.type,
                                        isRequired: field.isRequired,
                                        placeholder: field.placeholder || undefined,
                                      });
                                      await loadSettings();
                                      setEditingQualFieldId(null);
                                      alertSuccess('Qualification field updated', 'Changes were saved.');
                                    } catch (err: any) {
                                      alertError('Error', err.message || 'Failed to update');
                                    } finally {
                                      setSaving(false);
                                    }
                                  }}
                                  disabled={saving}
                                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                                >
                                  {saving ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingQualFieldId(null); loadSettings(); }}
                                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-4 p-5">
                              <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-800 dark:text-white">{field.label}</span>
                              {field.isRequired && (
                                <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Required</span>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                              ID: {field.id} · {getQualTypeLabel(field.type)}
                              {validationHint && <span className="ml-1">· {validationHint}</span>}
                            </p>
                            {field.placeholder && (
                              <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500 italic">“{field.placeholder}”</p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingQualFieldId(field.id)}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
                              title="Edit field"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <label className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              <input
                                type="checkbox"
                                checked={field.isEnabled !== false}
                                onChange={async (e) => {
                                  try {
                                    await api.updateQualificationsField(field.id, { isEnabled: e.target.checked });
                                    await loadSettings();
                                    alertSuccess('Field updated', 'Changes were saved.');
                                  } catch (err: any) {
                                    alertError('Error', err.message || 'Failed to update');
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">On</span>
                            </label>
                            <button
                              type="button"
                              onClick={async () => {
                                const confirmed = await alertConfirm('Remove field?', `Remove "${field.label}"?`, 'Remove');
                                if (!confirmed.isConfirmed) return;
                                try {
                                  await api.deleteQualificationsField(field.id);
                                  await loadSettings();
                                  alertSuccess('Field removed', 'The qualification field was removed.');
                                } catch (err: any) {
                                  alertError('Error', err.message || 'Failed to remove');
                                }
                              }}
                              className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400 transition-colors"
                              title="Remove field"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                            </div>
                          )}
                        </div>
                      ); })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center dark:border-slate-700 dark:bg-slate-800/20">
                    <GraduationCap className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">No qualification fields yet</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">Add fields like Degree, Qualified year, etc.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
