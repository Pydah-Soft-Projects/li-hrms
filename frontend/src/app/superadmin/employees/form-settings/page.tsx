'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

// Icon Components
const TextIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

const TextareaIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const NumberIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);

const DateIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const EmailIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const PhoneIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const SelectIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CheckboxIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const FileIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ArrayIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const ObjectIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'email' | 'tel' | 'file' | 'array' | 'object' | 'userselect';
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  placeholder?: string;
  options?: Array<{ label: string; value: any }>;
  validation?: any;
  isRequired: boolean;
  isSystem: boolean;
  isEnabled: boolean;
  order: number;
  itemType?: 'string' | 'number' | 'object';
  itemSchema?: any;
}

interface FormGroup {
  id: string;
  label: string;
  order: number;
  isSystem: boolean;
  isEnabled: boolean;
  fields: FormField[];
}

interface QualificationsConfig {
  isEnabled?: boolean;
  enableCertificateUpload?: boolean;
  fields?: FormField[];
}

interface FormSettings {
  _id?: string;
  name: string;
  code: string;
  description?: string;
  groups: FormGroup[];
  qualifications?: QualificationsConfig;
  version: number;
  isActive: boolean;
}

export default function EmployeeFormSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ groupId: string; fieldId: string } | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddField, setShowAddField] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({ label: '' });
  const [newField, setNewField] = useState<Partial<FormField>>({
    label: '',
    type: 'text',
    dataType: 'string',
    isRequired: false,
    isEnabled: true,
    order: 0,
  });
  const [nestedFields, setNestedFields] = useState<Array<{ id?: string; label: string; type: string; isRequired: boolean }>>([]);
  const [showAddNestedField, setShowAddNestedField] = useState(false);
  const [newNestedField, setNewNestedField] = useState<{ label: string; type: string; isRequired: boolean }>({ label: '', type: 'text', isRequired: false });
  const [showNewQualField, setShowNewQualField] = useState(false);
  const [newQualField, setNewQualField] = useState<{
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'date' | 'select';
    isRequired: boolean;
    isEnabled: boolean;
    placeholder: string;
    validation: any;
    options: Array<{ label: string; value: string }>;
    order: number;
  }>({
    id: '',
    label: '',
    type: 'text',
    isRequired: false,
    isEnabled: true,
    placeholder: '',
    validation: {},
    options: [],
    order: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.getFormSettings();
      if (response.success && response.data) {
        setSettings(response.data);
        const groupIds = new Set<string>(response.data.groups.map((g: FormGroup) => g.id));
        setExpandedGroups(groupIds);
      } else {
        const initResponse = await api.initializeFormSettings();
        if (initResponse.success && initResponse.data) {
          setSettings(initResponse.data);
          const groupIds = new Set<string>(initResponse.data.groups.map((g: FormGroup) => g.id));
          setExpandedGroups(groupIds);
        } else {
          setMessage({ type: 'error', text: 'Failed to load form settings. Please try again.' });
        }
      }
    } catch (error: any) {
      console.error('Error loading form settings:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to load form settings' });
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleAddGroup = async () => {
    if (!newGroup.label.trim()) {
      setMessage({ type: 'error', text: 'Group label is required' });
      return;
    }

    try {
      setSaving(true);
      const groupId = newGroup.label.toLowerCase().replace(/\s+/g, '_');
      const maxOrder = settings?.groups.length ? Math.max(...settings.groups.map(g => g.order)) : 0;

      const response = await api.addFormGroup({
        id: groupId,
        label: newGroup.label,
        order: maxOrder + 1,
        isSystem: false,
        isEnabled: true,
        fields: [],
      });

      if (response.success) {
        await loadSettings();
        setShowAddGroup(false);
        setNewGroup({ label: '' });
        setMessage({ type: 'success', text: 'Group added successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to add group' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to add group' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = async (groupId: string) => {
    if (!newField.label?.trim()) {
      setMessage({ type: 'error', text: 'Field label is required' });
      return;
    }

    if (!newField.type) {
      setMessage({ type: 'error', text: 'Field type is required' });
      return;
    }

    try {
      setSaving(true);
      const group = settings?.groups.find(g => g.id === groupId);
      if (!group) return;

      const fieldId = newField.label.toLowerCase().replace(/\s+/g, '_');
      const maxOrder = group.fields.length ? Math.max(...group.fields.map(f => f.order)) : 0;

      // Determine dataType based on type
      let dataType: FormField['dataType'] = 'string';
      if (newField.type === 'number') dataType = 'number';
      else if (newField.type === 'date') dataType = 'date';
      else if (newField.type === 'array') dataType = 'array';
      else if (newField.type === 'object') dataType = 'object';
      else if (newField.type === 'userselect') dataType = 'array';

      // Build itemSchema for object type with nested fields
      let itemSchema = undefined;
      if (newField.type === 'object' && nestedFields.length > 0) {
        itemSchema = {
          fields: nestedFields.map((nf, idx) => ({
            id: nf.id || nf.label.toLowerCase().replace(/\s+/g, '_'),
            label: nf.label,
            type: nf.type,
            dataType: nf.type === 'number' ? 'number' : nf.type === 'date' ? 'date' : 'string',
            isRequired: nf.isRequired,
            isSystem: false,
            isEnabled: true,
            order: idx + 1,
          })),
        };
      }

      const fieldData: Partial<FormField> = {
        id: fieldId,
        label: newField.label,
        type: newField.type,
        dataType,
        placeholder: newField.placeholder,
        isRequired: newField.isRequired || false,
        isSystem: false,
        isEnabled: newField.isEnabled !== false,
        order: maxOrder + 1,
        options: newField.type === 'select' || newField.type === 'multiselect' ? newField.options || [] : undefined,
        itemType: newField.type === 'array' ? (newField.itemType || 'string') : undefined,
        itemSchema: newField.type === 'object' ? itemSchema : (newField.type === 'array' && newField.itemType === 'object' ? newField.itemSchema : undefined),
        validation: newField.type === 'userselect' ? { maxItems: 2 } : undefined,
      };

      const response = await api.addFormField(groupId, fieldData);

      if (response.success) {
        await loadSettings();
        setShowAddField(null);
        setNewField({
          label: '',
          type: 'text',
          dataType: 'string',
          isRequired: false,
          isEnabled: true,
          order: 0,
        });
        setNestedFields([]);
        setShowAddNestedField(false);
        setNewNestedField({ label: '', type: 'text', isRequired: false });
        setMessage({ type: 'success', text: 'Field added successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to add field' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to add field' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGroup = async (groupId: string, updates: Partial<FormGroup>) => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await api.updateFormGroup(groupId, updates);
      if (response.success) {
        await loadSettings();
        setEditingGroup(null);
        setMessage({ type: 'success', text: 'Group updated successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to update group' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update group' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!settings) return;

    const group = settings.groups.find(g => g.id === groupId);
    if (group?.isSystem) {
      setMessage({ type: 'error', text: 'System groups cannot be deleted' });
      return;
    }

    if (!confirm(`Are you sure you want to delete the group "${group?.label}"? This will also delete all fields in this group.`)) {
      return;
    }

    try {
      setSaving(true);
      const response = await api.deleteFormGroup(groupId);
      if (response.success) {
        await loadSettings();
        setMessage({ type: 'success', text: 'Group deleted successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to delete group' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to delete group' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateField = async (groupId: string, fieldId: string, updates: Partial<FormField>) => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await api.updateFormField(groupId, fieldId, updates);
      if (response.success) {
        await loadSettings();
        setEditingField(null);
        setMessage({ type: 'success', text: 'Field updated successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to update field' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update field' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteField = async (groupId: string, fieldId: string) => {
    if (!settings) return;

    const group = settings.groups.find(g => g.id === groupId);
    const field = group?.fields.find(f => f.id === fieldId);

    if (field?.isSystem) {
      setMessage({ type: 'error', text: 'System fields cannot be deleted' });
      return;
    }

    if (!confirm(`Are you sure you want to delete the field "${field?.label}"?`)) {
      return;
    }

    try {
      setSaving(true);
      const response = await api.deleteFormField(groupId, fieldId);
      if (response.success) {
        await loadSettings();
        setMessage({ type: 'success', text: 'Field deleted successfully' });
      } else {
        setMessage({ type: 'error', text: response.message || 'Failed to delete field' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to delete field' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading form settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">Failed to load form settings</p>
          <button
            onClick={loadSettings}
            className="mt-4 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const sortedGroups = [...settings.groups].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Employee Form Settings
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Configure dynamic fields and groups for employee application forms
            </p>
          </div>
          <button
            onClick={() => setShowAddGroup(true)}
            className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-600 hover:to-indigo-600"
          >
            + Add Group
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
              }`}
          >
            {message.text}
          </div>
        )}

        {/* Add Group Modal */}
        {showAddGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Add New Group</h3>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Group Label *
                  </label>
                  <input
                    type="text"
                    value={newGroup.label}
                    onChange={(e) => setNewGroup({ ...newGroup, label: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                    placeholder="e.g., Additional Information, Qualifications, etc."
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Groups help organize related fields together
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddGroup}
                    disabled={saving || !newGroup.label.trim()}
                    className="flex-1 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {saving ? 'Adding...' : 'Add Group'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddGroup(false);
                      setNewGroup({ label: '' });
                    }}
                    className="flex-1 rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-4">
          {sortedGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-2xl border border-slate-200 bg-white/95 shadow-lg dark:border-slate-800 dark:bg-slate-950/95"
            >
              {/* Group Header */}
              <div
                className="flex cursor-pointer items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`h-5 w-5 text-slate-400 transition-transform ${expandedGroups.has(group.id) ? 'rotate-90' : ''
                      }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                      {group.label}
                      {group.isSystem && (
                        <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                          System
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {group.fields.length} field{group.fields.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!group.isSystem && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingGroup(group.id);
                        }}
                        className="rounded-lg bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}
                        className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Group Content */}
              {expandedGroups.has(group.id) && (
                <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                  {/* Edit Group */}
                  {editingGroup === group.id && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <h4 className="mb-2 font-semibold text-blue-900 dark:text-blue-300">Edit Group</h4>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={group.label}
                          onChange={(e) => {
                            const newGroups = settings.groups.map((g) =>
                              g.id === group.id ? { ...g, label: e.target.value } : g
                            );
                            setSettings({ ...settings, groups: newGroups });
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                          placeholder="Group Label"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              handleUpdateGroup(group.id, { label: group.label });
                            }}
                            className="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingGroup(null);
                              loadSettings();
                            }}
                            className="rounded-lg bg-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add Field Button - Always visible for all groups (including system groups) */}
                  <button
                    onClick={() => {
                      setShowAddField(group.id);
                      setNewField({
                        label: '',
                        type: 'text',
                        dataType: 'string',
                        isRequired: false,
                        isEnabled: true,
                        order: 0,
                      });
                    }}
                    className="mb-4 w-full rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-all hover:border-blue-400 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                    title={`Add a new field to ${group.label}`}
                  >
                    + Add Field to {group.label}
                  </button>

                  {/* Add Field Modal */}
                  {showAddField === group.id && (
                    <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                      <h4 className="mb-3 font-semibold text-green-900 dark:text-green-300">Add New Field</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Field Label *
                          </label>
                          <input
                            type="text"
                            value={newField.label || ''}
                            onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                            placeholder="e.g., Emergency Contact"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Field Type *
                          </label>
                          <select
                            value={newField.type || 'text'}
                            onChange={(e) => {
                              const type = e.target.value as FormField['type'];
                              let dataType: FormField['dataType'] = 'string';
                              if (type === 'number') dataType = 'number';
                              else if (type === 'date') dataType = 'date';
                              else if (type === 'array') dataType = 'array';
                              else if (type === 'object') dataType = 'object';
                              else if (type === 'userselect') dataType = 'array';

                              // Reset nested fields when changing type
                              if (type !== 'object') {
                                setNestedFields([]);
                                setShowAddNestedField(false);
                              }

                              setNewField({ ...newField, type, dataType, options: type === 'multiselect' ? [] : newField.options });
                            }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                          >
                            <option value="text">Single Line Text</option>
                            <option value="textarea">Multiple Lines Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="email">Email Address</option>
                            <option value="tel">Phone Number</option>
                            <option value="select">Dropdown Selection (Single Choice)</option>
                            <option value="multiselect">Multiple Selection (Checkboxes)</option>
                            <option value="file">File Upload</option>
                            <option value="array">Multiple Options (Add Multiple Items)</option>
                            <option value="object">Group of Fields (Nested Fields)</option>
                            <option value="userselect">User Selection (Select from Users)</option>
                          </select>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {newField.type === 'text' && 'Single line text input'}
                            {newField.type === 'textarea' && 'Multi-line text area for longer text'}
                            {newField.type === 'number' && 'Numeric input only'}
                            {newField.type === 'date' && 'Date picker'}
                            {newField.type === 'email' && 'Email address with validation'}
                            {newField.type === 'tel' && 'Phone number input'}
                            {newField.type === 'select' && 'Dropdown menu - user selects one option'}
                            {newField.type === 'multiselect' && 'Multiple checkboxes - user can select multiple options'}
                            {newField.type === 'file' && 'File upload field'}
                            {newField.type === 'array' && 'Allows adding multiple items (e.g., multiple qualifications, experiences)'}
                            {newField.type === 'object' && 'Group of related fields together (e.g., address with street, city, zip)'}
                            {newField.type === 'userselect' && 'Select one or more users from the system (e.g., reporting managers)'}
                          </p>
                        </div>
                        {/* Options for Select and Multi-Select */}
                        {(newField.type === 'select' || newField.type === 'multiselect') && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                            <div className="mb-2 flex items-center gap-2">
                              {newField.type === 'select' ? (
                                <SelectIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              ) : (
                                <CheckboxIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              )}
                              <label className="block text-xs font-semibold text-blue-900 dark:text-blue-300">
                                {newField.type === 'select' ? 'Dropdown Options' : 'Checkbox Options'}
                              </label>
                            </div>
                            <p className="mb-2 text-xs text-blue-700 dark:text-blue-400">
                              Add one option per line. Format: <strong>Display Name|value</strong> or just <strong>Display Name</strong>
                            </p>
                            <textarea
                              value={newField.options?.map(o => `${o.label}|${o.value}`).join('\n') || ''}
                              onChange={(e) => {
                                const lines = e.target.value.split('\n').filter(l => l.trim());
                                const options = lines.map(line => {
                                  const [label, value] = line.split('|');
                                  return { label: label.trim(), value: value?.trim() || label.trim() };
                                });
                                setNewField({ ...newField, options });
                              }}
                              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm dark:border-blue-600 dark:bg-slate-800"
                              placeholder="Example:&#10;Male|male&#10;Female|female&#10;Other|other"
                              rows={4}
                            />
                            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                              Tip: Users will see the display name, but the value will be saved
                            </p>
                          </div>
                        )}

                        {/* Configuration for Array (Multiple Options) */}
                        {newField.type === 'array' && (
                          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
                            <div className="mb-2 flex items-center gap-2">
                              <ArrayIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              <label className="block text-xs font-semibold text-purple-900 dark:text-purple-300">
                                Multiple Items Configuration
                              </label>
                            </div>
                            <p className="mb-3 text-xs text-purple-700 dark:text-purple-400">
                              Configure what type of data each item will contain
                            </p>
                            <div className="space-y-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Item Type
                                </label>
                                <select
                                  value={newField.itemType || 'string'}
                                  onChange={(e) => {
                                    const itemType = e.target.value as 'string' | 'number' | 'object';
                                    setNewField({
                                      ...newField,
                                      itemType,
                                      itemSchema: itemType === 'object' ? { fields: [] } : undefined,
                                    });
                                  }}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                                >
                                  <option value="string">Simple Text (e.g., Skill names)</option>
                                  <option value="number">Number (e.g., Years of experience)</option>
                                  <option value="object">Group of Fields (e.g., Qualification with degree, percentage, year)</option>
                                </select>
                              </div>
                              {newField.itemType === 'object' && (
                                <div className="rounded-lg border border-purple-300 bg-white p-3 dark:border-purple-700 dark:bg-slate-800">
                                  <p className="mb-2 text-xs font-medium text-purple-900 dark:text-purple-300">
                                    Configure nested fields for each item:
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    For complex nested fields, you can add them after creating the field. This creates a structure where users can add multiple items, each containing these fields.
                                  </p>
                                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                    Example: For "Qualifications", each item could have: Degree, Institution, Year, Percentage
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Configuration for Object (Group of Fields) */}
                        {newField.type === 'object' && (
                          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
                            <div className="mb-3 flex items-center gap-2">
                              <ObjectIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                              <label className="block text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                                Nested Fields Configuration
                              </label>
                            </div>
                            <p className="mb-3 text-xs text-indigo-700 dark:text-indigo-400">
                              Add fields that will be grouped together. Example: "Address" could have Street, City, State, Zip Code.
                            </p>

                            {/* Nested Fields List */}
                            {nestedFields.length > 0 && (
                              <div className="mb-3 space-y-2">
                                {nestedFields.map((nf, idx) => (
                                  <div key={idx} className="flex items-center justify-between rounded-lg border border-indigo-300 bg-white p-2 dark:border-indigo-700 dark:bg-slate-800">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{nf.label}</span>
                                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                                          {nf.type}
                                        </span>
                                        {nf.isRequired && (
                                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                            Required
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setNestedFields(nestedFields.filter((_, i) => i !== idx));
                                      }}
                                      className="rounded-lg bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add Nested Field */}
                            {showAddNestedField ? (
                              <div className="mb-3 rounded-lg border border-indigo-300 bg-white p-3 dark:border-indigo-700 dark:bg-slate-800">
                                <h5 className="mb-2 text-xs font-semibold text-slate-900 dark:text-slate-100">Add Nested Field</h5>
                                <div className="space-y-2">
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                      Field Label *
                                    </label>
                                    <input
                                      type="text"
                                      value={newNestedField.label}
                                      onChange={(e) => setNewNestedField({ ...newNestedField, label: e.target.value })}
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                                      placeholder="e.g., Street, City, Degree"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                      Field Type *
                                    </label>
                                    <select
                                      value={newNestedField.type}
                                      onChange={(e) => setNewNestedField({ ...newNestedField, type: e.target.value })}
                                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                                    >
                                      <option value="text">Text</option>
                                      <option value="textarea">Textarea</option>
                                      <option value="number">Number</option>
                                      <option value="date">Date</option>
                                      <option value="email">Email</option>
                                      <option value="tel">Phone</option>
                                    </select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={newNestedField.isRequired}
                                      onChange={(e) => setNewNestedField({ ...newNestedField, isRequired: e.target.checked })}
                                      className="h-3 w-3 rounded border-slate-300 text-indigo-600"
                                    />
                                    <label className="text-xs text-slate-700 dark:text-slate-300">Required</label>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        if (newNestedField.label.trim()) {
                                          const nestedId = newNestedField.label.toLowerCase().replace(/\s+/g, '_');
                                          setNestedFields([
                                            ...nestedFields,
                                            { ...newNestedField, id: nestedId },
                                          ]);
                                          setNewNestedField({ label: '', type: 'text', isRequired: false });
                                          setShowAddNestedField(false);
                                        }
                                      }}
                                      className="flex-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
                                    >
                                      Add Field
                                    </button>
                                    <button
                                      onClick={() => {
                                        setShowAddNestedField(false);
                                        setNewNestedField({ label: '', type: 'text', isRequired: false });
                                      }}
                                      className="flex-1 rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowAddNestedField(true)}
                                className="w-full rounded-lg border-2 border-dashed border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 transition-all hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-400"
                              >
                                + Add Nested Field
                              </button>
                            )}
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Placeholder
                          </label>
                          <input
                            type="text"
                            value={newField.placeholder || ''}
                            onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                            placeholder="Enter placeholder text"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={newField.isRequired || false}
                              onChange={(e) => setNewField({ ...newField, isRequired: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-300">Required</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={newField.isEnabled !== false}
                              onChange={(e) => setNewField({ ...newField, isEnabled: e.target.checked })}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-xs text-slate-700 dark:text-slate-300">Enabled</span>
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAddField(group.id)}
                            disabled={saving || !newField.label?.trim()}
                            className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                          >
                            {saving ? 'Adding...' : 'Add Field'}
                          </button>
                          <button
                            onClick={() => {
                              setShowAddField(null);
                              setNewField({
                                label: '',
                                type: 'text',
                                dataType: 'string',
                                isRequired: false,
                                isEnabled: true,
                                order: 0,
                              });
                              setNestedFields([]);
                              setShowAddNestedField(false);
                              setNewNestedField({ label: '', type: 'text', isRequired: false });
                            }}
                            className="flex-1 rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fields List */}
                  <div className="mb-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Fields ({group.fields.length})
                      </h4>
                      {group.fields.length > 0 && (
                        <button
                          onClick={() => {
                            setShowAddField(group.id);
                            setNewField({
                              label: '',
                              type: 'text',
                              dataType: 'string',
                              isRequired: false,
                              isEnabled: true,
                              order: 0,
                            });
                          }}
                          className="rounded-lg bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                        >
                          + Add Another Field
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {group.fields.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
                          <svg
                            className="mx-auto h-12 w-12 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            No fields in this group yet
                          </p>
                          {!group.isSystem && (
                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                              Click "Add Field" above to add your first field
                            </p>
                          )}
                        </div>
                      ) : (
                        group.fields
                          .sort((a, b) => a.order - b.order)
                          .map((field) => (
                            <div
                              key={field.id}
                              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-900 dark:text-slate-100">
                                    {field.label}
                                  </span>
                                  {field.isSystem && (
                                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                      System
                                    </span>
                                  )}
                                  {field.isRequired && (
                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                      Required
                                    </span>
                                  )}
                                  {!field.isEnabled && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
                                  <div className="flex items-center gap-1.5">
                                    {field.type === 'text' && <TextIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'textarea' && <TextareaIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'number' && <NumberIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'date' && <DateIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'email' && <EmailIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'tel' && <PhoneIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'select' && <SelectIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'multiselect' && <CheckboxIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'file' && <FileIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'array' && <ArrayIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'object' && <ObjectIcon className="h-3 w-3 text-slate-400" />}
                                    {field.type === 'userselect' && <UserIcon className="h-3 w-3 text-slate-400" />}
                                    <span>
                                      {
                                        field.type === 'text' ? 'Single Line Text' :
                                          field.type === 'textarea' ? 'Multiple Lines' :
                                            field.type === 'number' ? 'Number' :
                                              field.type === 'date' ? 'Date' :
                                                field.type === 'email' ? 'Email' :
                                                  field.type === 'tel' ? 'Phone' :
                                                    field.type === 'select' ? 'Dropdown' :
                                                      field.type === 'multiselect' ? 'Multiple Selection' :
                                                        field.type === 'file' ? 'File Upload' :
                                                          field.type === 'array' ? 'Multiple Options' :
                                                            field.type === 'object' ? 'Group of Fields' :
                                                              field.type === 'userselect' ? 'User Selection' :
                                                                field.type
                                      }
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (editingField?.groupId === group.id && editingField?.fieldId === field.id) {
                                      setEditingField(null);
                                    } else {
                                      setEditingField({ groupId: group.id, fieldId: field.id });
                                    }
                                  }}
                                  className="rounded-lg bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                                >
                                  {editingField?.groupId === group.id && editingField?.fieldId === field.id
                                    ? 'Cancel'
                                    : 'Edit'}
                                </button>
                                {!field.isSystem && (
                                  <button
                                    onClick={() => handleDeleteField(group.id, field.id)}
                                    className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Edit Field Modal */}
                  {editingField?.groupId === group.id && editingField?.fieldId && (() => {
                    const fieldToEdit = group.fields.find(f => f.id === editingField.fieldId);
                    if (!fieldToEdit) return null;

                    return (
                      <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                        <h4 className="mb-3 font-semibold text-orange-900 dark:text-orange-300">Edit Field: {fieldToEdit.label}</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                              Field Label *
                            </label>
                            <input
                              type="text"
                              value={fieldToEdit.label}
                              onChange={(e) => {
                                const updatedGroups = settings.groups.map(g =>
                                  g.id === group.id
                                    ? {
                                      ...g,
                                      fields: g.fields.map(f =>
                                        f.id === fieldToEdit.id ? { ...f, label: e.target.value } : f
                                      )
                                    }
                                    : g
                                );
                                setSettings({ ...settings, groups: updatedGroups });
                              }}
                              disabled={fieldToEdit.isSystem}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 disabled:opacity-50"
                              placeholder="Field Label"
                            />
                            {fieldToEdit.isSystem && (
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                System fields can only have their label edited
                              </p>
                            )}
                          </div>
                          {!fieldToEdit.isSystem && (
                            <>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                  Placeholder
                                </label>
                                <input
                                  type="text"
                                  value={fieldToEdit.placeholder || ''}
                                  onChange={(e) => {
                                    const updatedGroups = settings.groups.map(g =>
                                      g.id === group.id
                                        ? {
                                          ...g,
                                          fields: g.fields.map(f =>
                                            f.id === fieldToEdit.id ? { ...f, placeholder: e.target.value } : f
                                          )
                                        }
                                        : g
                                    );
                                    setSettings({ ...settings, groups: updatedGroups });
                                  }}
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                                  placeholder="Enter placeholder text"
                                />
                              </div>
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={fieldToEdit.isRequired || false}
                                    onChange={(e) => {
                                      const updatedGroups = settings.groups.map(g =>
                                        g.id === group.id
                                          ? {
                                            ...g,
                                            fields: g.fields.map(f =>
                                              f.id === fieldToEdit.id ? { ...f, isRequired: e.target.checked } : f
                                            )
                                          }
                                          : g
                                      );
                                      setSettings({ ...settings, groups: updatedGroups });
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  />
                                  <span className="text-xs text-slate-700 dark:text-slate-300">Required</span>
                                </label>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={fieldToEdit.isEnabled !== false}
                                    onChange={(e) => {
                                      const updatedGroups = settings.groups.map(g =>
                                        g.id === group.id
                                          ? {
                                            ...g,
                                            fields: g.fields.map(f =>
                                              f.id === fieldToEdit.id ? { ...f, isEnabled: e.target.checked } : f
                                            )
                                          }
                                          : g
                                      );
                                      setSettings({ ...settings, groups: updatedGroups });
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                  />
                                  <span className="text-xs text-slate-700 dark:text-slate-300">Enabled</span>
                                </label>
                              </div>
                            </>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const fieldToSave = settings?.groups.find(g => g.id === group.id)?.fields.find(f => f.id === fieldToEdit.id);
                                if (fieldToSave) {
                                  handleUpdateField(group.id, fieldToEdit.id, {
                                    label: fieldToSave.label,
                                    placeholder: fieldToSave.placeholder,
                                    isRequired: fieldToSave.isRequired,
                                    isEnabled: fieldToSave.isEnabled,
                                  });
                                }
                              }}
                              disabled={saving}
                              className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingField(null);
                                loadSettings();
                              }}
                              className="flex-1 rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Qualifications Configuration Section */}
        <div className="mt-8 rounded-2xl border border-purple-200 bg-purple-50/50 p-6 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-300">Qualifications Configuration</h3>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-400">
                Configure qualifications as a special array of objects field. Each qualification can have multiple fields.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.qualifications?.isEnabled !== false}
                  onChange={async (e) => {
                    const updatedSettings = {
                      ...settings,
                      qualifications: {
                        ...settings.qualifications,
                        isEnabled: e.target.checked,
                        fields: settings.qualifications?.fields || [],
                      },
                    };
                    setSettings(updatedSettings);
                    await api.updateQualificationsConfig({ isEnabled: e.target.checked });
                    await loadSettings();
                  }}
                  className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-300">Enable Qualifications</span>
              </label>

              {settings.qualifications?.isEnabled !== false && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.qualifications?.enableCertificateUpload || false}
                    onChange={async (e) => {
                      const updatedSettings = {
                        ...settings,
                        qualifications: {
                          ...settings.qualifications,
                          enableCertificateUpload: e.target.checked,
                          fields: settings.qualifications?.fields || [],
                        },
                      };
                      setSettings(updatedSettings);
                      // Update via API - use the correct endpoint
                      try {
                        await api.updateQualificationsConfig({
                          enableCertificateUpload: e.target.checked,
                        });
                        setMessage({ type: 'success', text: 'Certificate upload setting updated' });
                        await loadSettings();
                      } catch (error: any) {
                        setMessage({ type: 'error', text: error.message || 'Failed to update setting' });
                      }
                    }}
                    className="h-4 w-4 rounded text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-green-900 dark:text-green-300">
                    📎 Enable Certificate Upload
                  </span>
                </label>
              )}
            </div>
          </div>

          {settings.qualifications?.isEnabled !== false && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300">Qualification Fields</h4>
                <button
                  onClick={() => {
                    const newFieldId = `qual_field_${Date.now()}`;
                    setNewQualField({
                      id: newFieldId,
                      label: '',
                      type: 'text',
                      isRequired: false,
                      isEnabled: true,
                      placeholder: '',
                      validation: {},
                      options: [],
                      order: (settings.qualifications?.fields?.length || 0) + 1,
                    });
                    setShowNewQualField(true);
                  }}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                >
                  + Add Field
                </button>
              </div>

              {settings.qualifications?.fields && settings.qualifications.fields.length > 0 ? (
                <div className="space-y-3">
                  {settings.qualifications.fields
                    .sort((a, b) => a.order - b.order)
                    .map((field) => (
                      <div
                        key={field.id}
                        className="rounded-lg border border-purple-200 bg-white p-4 dark:border-purple-700 dark:bg-slate-800"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                              {field.type === 'text' && <TextIcon className="h-4 w-4" />}
                              {field.type === 'textarea' && <TextareaIcon className="h-4 w-4" />}
                              {field.type === 'number' && <NumberIcon className="h-4 w-4" />}
                              {field.type === 'date' && <DateIcon className="h-4 w-4" />}
                              {field.type === 'select' && <SelectIcon className="h-4 w-4" />}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-slate-100">{field.label}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {field.type} {field.isRequired && '• Required'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={field.isEnabled}
                                onChange={async (e) => {
                                  await api.updateQualificationsField(field.id, { isEnabled: e.target.checked });
                                  await loadSettings();
                                }}
                                className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-xs text-slate-600 dark:text-slate-400">Enabled</span>
                            </label>
                            <button
                              onClick={async () => {
                                await api.deleteQualificationsField(field.id);
                                await loadSettings();
                              }}
                              className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No qualification fields configured yet.</p>
              )}

              {/* Add Qualification Field Modal */}
              {showNewQualField && (
                <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                  <h4 className="mb-3 font-semibold text-purple-900 dark:text-purple-300">Add Qualification Field</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Field ID *
                      </label>
                      <input
                        type="text"
                        value={newQualField.id}
                        onChange={(e) => setNewQualField({ ...newQualField, id: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                        placeholder="e.g., degree, qualified_year"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Field Label *
                      </label>
                      <input
                        type="text"
                        value={newQualField.label}
                        onChange={(e) => setNewQualField({ ...newQualField, label: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                        placeholder="e.g., Degree, Qualified Year"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Field Type *
                      </label>
                      <select
                        value={newQualField.type}
                        onChange={(e) => setNewQualField({ ...newQualField, type: e.target.value as any })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                      >
                        <option value="text">Single Line Text</option>
                        <option value="textarea">Multi-line Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="select">Dropdown Selection</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={newQualField.isRequired}
                          onChange={(e) => setNewQualField({ ...newQualField, isRequired: e.target.checked })}
                          className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-xs text-slate-700 dark:text-slate-300">Required</span>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!newQualField.id || !newQualField.label) {
                            alert('Field ID and Label are required');
                            return;
                          }
                          await api.addQualificationsField(newQualField);
                          setShowNewQualField(false);
                          setNewQualField({
                            id: '',
                            label: '',
                            type: 'text',
                            isRequired: false,
                            isEnabled: true,
                            placeholder: '',
                            validation: {},
                            options: [],
                            order: 0,
                          });
                          await loadSettings();
                        }}
                        className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                      >
                        Add Field
                      </button>
                      <button
                        onClick={() => {
                          setShowNewQualField(false);
                          setNewQualField({
                            id: '',
                            label: '',
                            type: 'text',
                            isRequired: false,
                            isEnabled: true,
                            placeholder: '',
                            validation: {},
                            options: [],
                            order: 0,
                          });
                        }}
                        className="flex-1 rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <h4 className="mb-2 text-sm font-semibold text-blue-800 dark:text-blue-300">ℹ️ About Form Settings</h4>
          <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-400">
            <li>• <strong>System Groups/Fields:</strong> Cannot be deleted, but you can add new fields to system groups</li>
            <li>• <strong>Custom Groups/Fields:</strong> Can be fully edited and deleted</li>
            <li>• <strong>Multiple Options Field:</strong> Allows users to add multiple items (e.g., multiple qualifications, experiences)</li>
            <li>• <strong>Multiple Selection:</strong> Users can select multiple options using checkboxes</li>
            <li>• <strong>Group of Fields:</strong> Creates nested fields that belong together (e.g., address with street, city, zip)</li>
            <li>• Changes take effect immediately for new employee applications</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
