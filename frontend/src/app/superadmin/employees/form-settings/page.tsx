'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';

import {
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit3,
  Save,
  X,
  Layout,
  User,
  Calendar,
  Hash,
  Type,
  AlignLeft,
  Mail,
  Phone,
  List,
  CheckSquare,
  FileUp,
  PlusCircle,
  Box,
  Users,
  Check,
  History,
  AlertCircle,
  ShieldCheck,
  Zap,
  GraduationCap,
  Paperclip,
  Info,
  Layers,
  Database
} from 'lucide-react';

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
  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="h-4 w-4" />;
      case 'textarea': return <AlignLeft className="h-4 w-4" />;
      case 'number': return <Hash className="h-4 w-4" />;
      case 'date': return <Calendar className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'tel': return <Phone className="h-4 w-4" />;
      case 'select': return <List className="h-4 w-4" />;
      case 'multiselect': return <CheckSquare className="h-4 w-4" />;
      case 'file': return <FileUp className="h-4 w-4" />;
      case 'array': return <PlusCircle className="h-4 w-4" />;
      case 'object': return <Box className="h-4 w-4" />;
      case 'userselect': return <Users className="h-4 w-4" />;
      default: return <Type className="h-4 w-4" />;
    }
  };

  const getFieldLabel = (type: string) => {
    const labels: Record<string, string> = {
      text: 'Single Line Text',
      textarea: 'Multiple Lines',
      number: 'Numeric Value',
      date: 'Date Protocol',
      email: 'Electronic Mail',
      tel: 'Contact Number',
      select: 'Single Choice Dropdown',
      multiselect: 'Multiple Selection',
      file: 'Document Upload',
      array: 'Dynamic Array',
      object: 'Nested Schema',
      userselect: 'Identity Selection'
    };
    return labels[type] || type;
  };

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
        <Spinner />
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
    <div className="min-h-screen bg-slate-200/60 p-4 dark:bg-slate-950 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Refined Professional Header */}
        <div className="relative mb-10 overflow-hidden rounded-[2rem] border border-slate-300 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <div className="absolute right-0 top-0 h-48 w-48 -translate-y-12 translate-x-12 rounded-full bg-blue-500/[0.05] blur-3xl" />

          <div className="relative z-10 flex flex-col gap-6 px-8 py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100/50 text-blue-700 shadow-sm dark:bg-white/10 dark:text-blue-400 border border-blue-200">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Form Engine</h1>
                    <span className="rounded-full bg-blue-600/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400 border border-blue-200/50">
                      Settings Hub
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600">Dynamic UI Schema & Field Protocols</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAddGroup(true)}
                  className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-xl bg-slate-950 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-blue-700 active:scale-[0.98] dark:bg-white dark:text-slate-900 shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  <span>Execute Add Group</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-10 flex items-center gap-3 rounded-2xl border px-6 py-4 text-sm font-semibold shadow-sm ${message.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400'
              }`}
          >
            {message.type === 'success' ? <Check className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            {message.text}
          </div>
        )}

        {/* Add Group Modal */}
        {showAddGroup && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/20 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 animate-in zoom-in-95 duration-300">
              <div className="relative border-b border-slate-100 bg-slate-50/50 px-8 py-6 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-blue-500/[0.05] blur-2xl" />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none">
                    <PlusCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white uppercase tracking-widest">Execute Group Creation</h3>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Architect New Logical Container</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Structural Handle (Label)</label>
                  <input
                    type="text"
                    value={newGroup.label}
                    onChange={(e) => setNewGroup({ ...newGroup, label: e.target.value })}
                    className="w-full rounded-2xl border border-slate-300 bg-white py-4 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:bg-slate-900 dark:text-white"
                    placeholder="e.g., Professional Experience"
                  />
                  <div className="flex gap-2 items-start ml-1 mt-2">
                     <Info className="h-3 w-3 text-slate-400 mt-0.5" />
                     <p className="text-[10px] font-medium text-slate-500 leading-relaxed uppercase tracking-wider">
                       Groups categorize related data clusters for orchestration.
                     </p>
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setShowAddGroup(false);
                      setNewGroup({ label: '' });
                    }}
                    className="flex-1 rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-slate-950 transition-colors bg-slate-50 dark:bg-slate-800"
                  >
                    Abort
                  </button>
                  <button
                    onClick={handleAddGroup}
                    disabled={saving || !newGroup.label.trim()}
                    className="flex-[2] rounded-2xl bg-slate-950 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-slate-950"
                  >
                    {saving ? 'Processing...' : 'Commit Container'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-6">
          {sortedGroups.map((group) => (
            <div
              key={group.id}
              className="group relative overflow-hidden rounded-[2.5rem] border border-slate-300 bg-slate-50 shadow-sm transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/40"
            >
              <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-blue-500/[0.03] blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Group Header */}
              <div
                className={`flex cursor-pointer items-center justify-between px-8 py-6 transition-colors ${expandedGroups.has(group.id) ? 'bg-slate-100/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800' : 'hover:bg-slate-100/30'}`}
                onClick={() => toggleGroup(group.id)}
              >
                <div className="flex items-center gap-5">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-all ${expandedGroups.has(group.id) ? 'bg-slate-950 text-white rotate-90 dark:bg-white dark:text-slate-950' : 'bg-white text-slate-400 border border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <ChevronRight className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                        {group.label}
                      </h3>
                      {group.isSystem && (
                        <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          <ShieldCheck className="h-3 w-3" />
                          System
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Contains {group.fields.length} structural field{group.fields.length !== 1 ? 's' : ''} defined in persistence
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {!group.isSystem && (
                    <>
                      <button
                        onClick={() => setEditingGroup(group.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:border-blue-600 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 shadow-sm"
                        title="Edit Metadata"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:border-rose-600 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 shadow-sm"
                        title="Purge Group"
                      >
                        <Trash2 className="h-4 w-4" />
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
                    <div className="mb-8 rounded-3xl border border-blue-200 bg-blue-50/50 p-8 dark:border-blue-800 dark:bg-blue-900/10 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-blue-500/[0.05] blur-2xl" />
                      <div className="relative flex items-center gap-3 mb-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
                          <Edit3 className="h-5 w-5" />
                        </div>
                        <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-widest">Modify Metadata</h4>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Entity Label</label>
                          <input
                            type="text"
                            value={group.label}
                            onChange={(e) => {
                              const newGroups = settings.groups.map((g) =>
                                g.id === group.id ? { ...g, label: e.target.value } : g
                              );
                              setSettings({ ...settings, groups: newGroups });
                            }}
                            className="w-full rounded-2xl border border-blue-200 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:bg-slate-900 dark:text-white dark:border-blue-800/50"
                            placeholder="Group Label"
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              handleUpdateGroup(group.id, { label: group.label });
                            }}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98]"
                          >
                            <Save className="h-4 w-4" />
                            <span>Save Changes</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditingGroup(null);
                              loadSettings();
                            }}
                            className="rounded-xl bg-white px-6 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-[0.98] dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add Field Button */}
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
                    className="group/add-btn mb-6 flex w-full items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 px-8 py-5 text-sm font-bold text-slate-500 transition-all hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-blue-400 dark:hover:text-blue-400 shadow-sm"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 transition-all group-hover/add-btn:bg-blue-100 group-hover/add-btn:text-blue-600 dark:bg-slate-900 dark:group-hover/add-btn:bg-blue-900/40">
                      <PlusCircle className="h-6 w-6" />
                    </div>
                    <span>Provision Architectural Field for {group.label}</span>
                  </button>

                  {/* Add Field Modal */}
                  {showAddField === group.id && (
                    <div className="mb-8 rounded-3xl border border-emerald-200 bg-emerald-50/30 p-8 dark:border-emerald-800 dark:bg-emerald-900/10 shadow-sm relative overflow-hidden">
                      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-emerald-500/[0.05] blur-2xl" />
                      <div className="relative flex items-center gap-3 mb-8">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg">
                          <PlusCircle className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-widest">Architect New Field</h4>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Define Structural Attribute</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Primary Metadata */}
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                              <Type className="h-3 w-3 text-emerald-600" />
                              Visual Label
                            </label>
                            <input
                              type="text"
                              value={newField.label || ''}
                              onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all dark:bg-slate-900 dark:text-white"
                              placeholder="e.g., Emergency Contact Number"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                              <Settings className="h-3 w-3 text-emerald-600" />
                              Data Classification
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
                                if (type !== 'object') {
                                  setNestedFields([]);
                                  setShowAddNestedField(false);
                                }
                                setNewField({ ...newField, type, dataType, options: type === 'multiselect' ? [] : newField.options });
                              }}
                              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all dark:bg-slate-900 dark:text-white"
                            >
                              <optgroup label="Standard Inputs">
                                <option value="text">Single Line Text</option>
                                <option value="textarea">Multiple Lines Text</option>
                                <option value="number">Numeric Value</option>
                                <option value="date">Date Protocol</option>
                              </optgroup>
                              <optgroup label="Extended Inputs">
                                <option value="email">Electronic Mail</option>
                                <option value="tel">Telephonic Contact</option>
                                <option value="select">Dropdown Choice</option>
                                <option value="multiselect">Checkbox Cluster</option>
                                <option value="file">Binary Upload</option>
                              </optgroup>
                              <optgroup label="Advanced Schema">
                                <option value="array">Dynamic List (Array)</option>
                                <option value="object">Nested Object (Group)</option>
                                <option value="userselect">Identity Selection</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {/* Functional Properties */}
                        <div className="space-y-6">
                           <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
                              <AlignLeft className="h-3 w-3 text-emerald-600" />
                              Input Placeholder
                            </label>
                            <input
                              type="text"
                              value={newField.placeholder || ''}
                              onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all dark:bg-slate-900 dark:text-white"
                              placeholder="e.g., +91 98765 43210"
                            />
                          </div>

                          <div className="flex gap-6 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Strictly Required</span>
                              <div className="relative inline-flex items-center">
                                <input
                                  type="checkbox"
                                  checked={newField.isRequired || false}
                                  onChange={(e) => setNewField({ ...newField, isRequired: e.target.checked })}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                              </div>
                            </label>
                            <div className="w-px bg-slate-200 dark:bg-slate-800" />
                            <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Active State</span>
                              <div className="relative inline-flex items-center">
                                <input
                                  type="checkbox"
                                  checked={newField.isEnabled !== false}
                                  onChange={(e) => setNewField({ ...newField, isEnabled: e.target.checked })}
                                  className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-500/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Advanced Configurations */}
                      {(newField.type === 'select' || newField.type === 'multiselect') && (
                        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-6 dark:border-emerald-800 dark:bg-slate-900 shadow-sm animate-in fade-in slide-in-from-top-4">
                          <div className="flex items-center gap-3 mb-4">
                            <List className="h-4 w-4 text-emerald-600" />
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Option Allocation Pool</h5>
                          </div>
                          <p className="text-[9px] font-medium text-slate-500 uppercase tracking-wider mb-3">Format: Label|Value (one per line)</p>
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
                            className="w-full rounded-2xl border border-slate-300 bg-white py-4 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-emerald-500 transition-all dark:bg-slate-950 dark:text-white"
                            placeholder="e.g., Male|male&#10;Female|female"
                            rows={4}
                          />
                        </div>
                      )}

                      {newField.type === 'array' && (
                        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-6 dark:border-emerald-800 dark:bg-slate-900 shadow-sm animate-in fade-in slide-in-from-top-4">
                          <div className="flex items-center gap-3 mb-6">
                            <Layers className="h-4 w-4 text-emerald-600" />
                            <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Array Protocol Definition</h5>
                          </div>
                          <div className="space-y-4">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Element Data Type</label>
                            <select
                              value={newField.itemType || 'string'}
                              onChange={(e) => setNewField({ ...newField, itemType: e.target.value as any })}
                              className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-emerald-500 transition-all dark:bg-slate-950 dark:text-white"
                            >
                              <option value="string">String Literal</option>
                              <option value="number">Numeric Value</option>
                              <option value="date">Date Protocol</option>
                              <option value="object">Complex Object</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {(newField.type === 'object' || (newField.type === 'array' && newField.itemType === 'object')) && (
                        <div className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50/30 p-8 dark:border-emerald-800 dark:bg-slate-900 shadow-sm animate-in fade-in slide-in-from-top-4">
                          <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                              <Box className="h-4 w-4 text-emerald-600" />
                              <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Nested Schema Architecture</h5>
                            </div>
                            <button
                              onClick={() => {
                                setShowAddNestedField(true);
                                setNewNestedField({ label: '', type: 'text', isRequired: false });
                              }}
                              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-white shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
                            >
                              <Plus className="h-3 w-3" />
                              Add Property
                            </button>
                          </div>

                          <div className="space-y-3">
                            {nestedFields.map((nf, idx) => (
                              <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                <div className="flex items-center gap-4">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 dark:bg-slate-900">
                                    {getFieldIcon(nf.type)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-slate-950 dark:text-white">{nf.label}</span>
                                      {nf.isRequired && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-600 border border-rose-100">Strict</span>}
                                    </div>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{getFieldLabel(nf.type)}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setNestedFields(nestedFields.filter((_, i) => i !== idx))}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}

                            {nestedFields.length === 0 && !showAddNestedField && (
                              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-white/50 dark:border-slate-800 dark:bg-slate-950/50">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No properties defined in nested schema</p>
                              </div>
                            )}

                            {showAddNestedField && (
                              <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-xl dark:border-emerald-800 dark:bg-slate-950 animate-in zoom-in-95 duration-200">
                                <h6 className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-6 flex items-center gap-2">
                                   <Plus className="h-3 w-3" />
                                   New Nested Property
                                </h6>
                                <div className="grid grid-cols-1 gap-6">
                                  <div className="space-y-2">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Property Label</label>
                                    <input
                                      type="text"
                                      value={newNestedField.label}
                                      onChange={(e) => setNewNestedField({ ...newNestedField, label: e.target.value })}
                                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-xs font-semibold focus:border-emerald-500 transition-all dark:bg-slate-900"
                                      placeholder="e.g., Street Address"
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 ml-1">Data Protocol</label>
                                      <select
                                        value={newNestedField.type}
                                        onChange={(e) => setNewNestedField({ ...newNestedField, type: e.target.value })}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 px-4 text-xs font-semibold focus:border-emerald-500 transition-all dark:bg-slate-900"
                                      >
                                        <option value="text">Line Text</option>
                                        <option value="number">Numeric</option>
                                        <option value="date">Date</option>
                                      </select>
                                    </div>
                                    <div className="flex bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 mt-5">
                                      <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                                        <span className="text-[9px] font-bold uppercase text-slate-500">Strict</span>
                                        <div className="relative inline-flex items-center">
                                          <input
                                            type="checkbox"
                                            checked={newNestedField.isRequired}
                                            onChange={(e) => setNewNestedField({ ...newNestedField, isRequired: e.target.checked })}
                                            className="sr-only peer"
                                          />
                                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-3 mt-8">
                                  <button
                                    onClick={() => setShowAddNestedField(false)}
                                    className="flex-1 rounded-xl py-3 text-[9px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-950 bg-slate-100 transition-colors"
                                  >
                                    Abort
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!newNestedField.label.trim()) return;
                                      setNestedFields([...nestedFields, { ...newNestedField }]);
                                      setShowAddNestedField(false);
                                      setNewNestedField({ label: '', type: 'text', isRequired: false });
                                    }}
                                    className="flex-[2] rounded-xl bg-slate-950 py-3 text-[9px] font-bold uppercase tracking-widest text-white shadow-lg hover:bg-slate-800 transition-all active:scale-95"
                                  >
                                    Commit Property
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}


                      <div className="flex gap-4 mt-10 pt-8 border-t border-emerald-200 dark:border-emerald-800">
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
                          className="flex-1 rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-slate-950 transition-colors bg-white dark:bg-slate-800"
                        >
                          Cancel Operations
                        </button>
                        <button
                          onClick={() => handleAddField(group.id)}
                          disabled={saving || !newField.label?.trim()}
                          className="flex-[2] rounded-2xl bg-emerald-600 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                        >
                          {saving ? 'Processing...' : 'Provision Field'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fields List */}
                  <div className="mb-8">
                    <div className="mb-6 flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                            Operational Fields ({group.fields.length})
                          </h4>
                        </div>
                    </div>
                    <div className="space-y-4">
                      {group.fields.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-100/30 p-12 text-center dark:border-slate-800 dark:bg-slate-900/20">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[2rem] bg-white text-slate-300 shadow-sm dark:bg-slate-800">
                             <Layout className="h-8 w-8" />
                          </div>
                          <p className="mt-4 text-sm font-bold text-slate-950 dark:text-white uppercase tracking-widest">No Fields Defined</p>
                          <p className="mt-2 text-xs font-medium text-slate-500">Initialize structural fields to begin schema definition.</p>
                        </div>
                      ) : (
                        group.fields
                          .sort((a, b) => a.order - b.order)
                          .map((field) => (
                            <div
                              key={field.id}
                              className="group/field relative flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 transition-all hover:border-blue-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 shadow-sm"
                            >
                              <div className="flex items-center gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 ${field.isEnabled ? 'bg-slate-100 text-slate-600 group-hover/field:bg-blue-600 group-hover/field:text-white dark:bg-slate-900' : 'bg-slate-50 text-slate-300 dark:bg-slate-900'}`}>
                                  {getFieldIcon(field.type)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-slate-950 dark:text-white">
                                      {field.label}
                                    </span>
                                    <div className="flex gap-1.5">
                                      {field.isSystem && (
                                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-blue-700 border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                                          System
                                        </span>
                                      )}
                                      {field.isRequired && (
                                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-rose-700 border border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800">
                                          Strict
                                        </span>
                                      )}
                                      {!field.isEnabled && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                                          Disabled
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {getFieldLabel(field.type)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (editingField?.groupId === group.id && editingField?.fieldId === field.id) {
                                      setEditingField(null);
                                    } else {
                                      setEditingField({ groupId: group.id, fieldId: field.id });
                                    }
                                  }}
                                  className={`flex h-10 items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest shadow-sm transition-all active:scale-[0.98] ${editingField?.groupId === group.id && editingField?.fieldId === field.id
                                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-600 hover:text-blue-600 shadow-inner'}`}
                                >
                                  {editingField?.groupId === group.id && editingField?.fieldId === field.id ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                                  <span>{editingField?.groupId === group.id && editingField?.fieldId === field.id ? 'Close' : 'Modify'}</span>
                                </button>
                                {!field.isSystem && (
                                  <button
                                    onClick={() => handleDeleteField(group.id, field.id)}
                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-rose-600 hover:text-rose-600 shadow-sm transition-all active:scale-[0.5] dark:border-slate-800 dark:bg-slate-900"
                                  >
                                    <Trash2 className="h-4 w-4" />
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
                      <div className="mt-8 rounded-[2.5rem] border border-blue-200 bg-blue-50/20 p-8 dark:border-blue-800 dark:bg-blue-900/10 shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-top-4">
                        <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-blue-500/[0.05] blur-2xl" />
                        <div className="relative flex items-center justify-between mb-8">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
                              <Edit3 className="h-6 w-6" />
                            </div>
                            <div>
                               <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 uppercase tracking-widest">Adjust Architectural Context</h4>
                               <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">Instance: {fieldToEdit.label}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Visual Identity</label>
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
                                className="w-full rounded-2xl border border-blue-200 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 transition-all dark:bg-slate-900 dark:text-white disabled:opacity-50"
                                placeholder="Field Label"
                              />
                            </div>
                            {fieldToEdit.isSystem && (
                              <div className="flex items-start gap-2 rounded-xl bg-blue-100/50 p-3 border border-blue-200/50">
                                <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5" />
                                <p className="text-[10px] font-medium text-blue-700 leading-relaxed">System-defined attributes restrict logical schema modifications. Only visual aliases may be adjusted.</p>
                              </div>
                            )}
                          </div>

                          {!fieldToEdit.isSystem && (
                            <div className="space-y-6">
                               <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Input Hint (Placeholder)</label>
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
                                  className="w-full rounded-2xl border border-blue-200 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 transition-all dark:bg-slate-900 dark:text-white"
                                  placeholder="Enter placeholder text"
                                />
                              </div>

                              <div className="flex gap-6 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-blue-200 dark:border-slate-800 shadow-sm">
                                <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Strictly Required</span>
                                  <div className="relative inline-flex items-center">
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
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                  </div>
                                </label>
                                <div className="w-px bg-slate-200 dark:bg-slate-800" />
                                <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Active State</span>
                                  <div className="relative inline-flex items-center">
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
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                                  </div>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Advanced configurations for Edit Mode */}
                        {(fieldToEdit.type === 'select' || fieldToEdit.type === 'multiselect') && (
                          <div className="mt-8 rounded-2xl border border-blue-200 bg-white p-6 dark:border-blue-800 dark:bg-slate-900 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <List className="h-4 w-4 text-blue-600" />
                              <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Option Allocation Pool</h5>
                            </div>
                            <textarea
                              value={fieldToEdit.options?.map(o => `${o.label}|${o.value}`).join('\n') || ''}
                              onChange={(e) => {
                                const lines = e.target.value.split('\n').filter(l => l.trim());
                                const options = lines.map(line => {
                                  const [label, value] = line.split('|');
                                  return { label: label.trim(), value: value?.trim() || label.trim() };
                                });
                                const updatedGroups = settings.groups.map(g =>
                                  g.id === group.id
                                    ? {
                                      ...g,
                                      fields: g.fields.map(f =>
                                        f.id === fieldToEdit.id ? { ...f, options } : f
                                      )
                                    }
                                    : g
                                );
                                setSettings({ ...settings, groups: updatedGroups });
                              }}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 transition-all dark:bg-slate-950 dark:text-white"
                              placeholder="Label|value (e.g., Male|male)"
                              rows={4}
                            />
                          </div>
                        )}

                        {fieldToEdit.type === 'array' && (
                          <div className="mt-8 rounded-2xl border border-blue-200 bg-white p-6 dark:border-blue-800 dark:bg-slate-900 shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                              <Layers className="h-4 w-4 text-blue-600" />
                              <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Array Protocol Definition</h5>
                            </div>
                            <div className="space-y-4">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Element Data Type</label>
                              <select
                                value={fieldToEdit.itemType || 'string'}
                                onChange={(e) => {
                                  const itemType = e.target.value as any;
                                  const updatedGroups = settings.groups.map(g =>
                                    g.id === group.id
                                      ? {
                                        ...g,
                                        fields: g.fields.map(f =>
                                          f.id === fieldToEdit.id ? { ...f, itemType } : f
                                        )
                                      }
                                      : g
                                  );
                                  setSettings({ ...settings, groups: updatedGroups });
                                }}
                                className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-blue-500 transition-all dark:bg-slate-950 dark:text-white"
                              >
                                <option value="string">String Literal</option>
                                <option value="number">Numeric Value</option>
                                <option value="date">Date Protocol</option>
                                <option value="object">Complex Object</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {(fieldToEdit.type === 'object' || (fieldToEdit.type === 'array' && fieldToEdit.itemType === 'object')) && (
                          <div className="mt-8 rounded-3xl border border-blue-200 bg-white p-8 dark:border-blue-800 dark:bg-slate-900 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                              <div className="flex items-center gap-3">
                                <Box className="h-4 w-4 text-blue-600" />
                                <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Nested Schema Architecture</h5>
                              </div>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Structural modification of existing nested schemas is locked in this instance.</p>
                            </div>

                            <div className="space-y-3">
                              {fieldToEdit.itemSchema?.fields?.map((nf: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                                  <div className="flex items-center gap-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                      {getFieldIcon(nf.type)}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-950 dark:text-white">{nf.label}</span>
                                        {nf.isRequired && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-600 border border-rose-100">Strict</span>}
                                      </div>
                                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{getFieldLabel(nf.type)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-4 mt-10 pt-8 border-t border-blue-200 dark:border-blue-800">
                          <button
                            onClick={() => {
                              const fieldToSave = settings?.groups.find(g => g.id === group.id)?.fields.find(f => f.id === fieldToEdit.id);
                              if (fieldToSave) {
                                handleUpdateField(group.id, fieldToEdit.id, {
                                  label: fieldToSave.label,
                                  placeholder: fieldToSave.placeholder,
                                  isRequired: fieldToSave.isRequired,
                                  isEnabled: fieldToSave.isEnabled,
                                  options: fieldToSave.options,
                                  itemType: fieldToSave.itemType,
                                  itemSchema: fieldToSave.itemSchema,
                                });
                              }
                            }}
                            disabled={saving}
                            className="flex-[2] flex items-center justify-center gap-3 rounded-2xl bg-slate-950 py-4 text-xs font-bold uppercase tracking-widest text-white shadow-xl transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-slate-950"
                          >
                            <Save className="h-4.5 w-4.5" />
                            <span>{saving ? 'Processing...' : 'Commit Modifications'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditingField(null);
                              loadSettings();
                            }}
                            className="flex-1 rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-slate-950 transition-colors bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700"
                          >
                            Discard
                          </button>
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
        <div className="mt-20 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-[2rem] bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-none">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-slate-950 dark:text-white tracking-tight">Academic Protocol Registry</h3>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <label className="flex items-center gap-2 cursor-pointer group/toggle">
                      <div className="relative inline-flex items-center">
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
                            setSettings(updatedSettings as any);
                            await api.updateQualificationsConfig({ isEnabled: e.target.checked });
                            await loadSettings();
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/20 rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover/toggle:text-indigo-600 transition-colors">Protocol Active</span>
                    </label>

                    {settings.qualifications?.isEnabled !== false && (
                      <label className="flex items-center gap-2 cursor-pointer group/toggle ml-4">
                        <div className="relative inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={settings.qualifications?.enableCertificateUpload || false}
                            onChange={async (e) => {
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
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/20 rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover/toggle:text-emerald-600 transition-colors">Credential Vault</span>
                      </label>
                    )}
                  </div>
                </div>
                <p className="text-xs font-medium text-slate-500 mt-0.5 uppercase tracking-widest">Configure qualification schema definitions</p>
              </div>
            </div>
            
            {settings.qualifications?.isEnabled !== false && (
              <button
                onClick={() => {
                  setNewQualField({
                    id: `qual_field_${Date.now()}`,
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
                className="flex items-center justify-center gap-3 rounded-2xl bg-slate-950 px-8 py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-950"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Provision Qualification Field</span>
              </button>
            )}
          </div>

          {settings.qualifications?.isEnabled !== false && (
            <>
              {settings.qualifications?.fields && settings.qualifications.fields.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-fit">
                  {settings.qualifications.fields
                    .sort((a, b) => a.order - b.order)
                    .map((field) => (
                      <div
                        key={field.id}
                        className="group/qual relative flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 transition-all hover:border-indigo-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 ${field.isEnabled ? 'bg-indigo-50 text-indigo-600 group-hover/qual:bg-indigo-600 group-hover/qual:text-white dark:bg-indigo-900/30' : 'bg-slate-50 text-slate-300 dark:bg-slate-900'}`}>
                             {getFieldIcon(field.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-slate-950 dark:text-white">{field.label}</span>
                              <div className="flex gap-1">
                                {field.isRequired && (
                                  <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-rose-700 border border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800">
                                    Strict
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              ID: {field.id} • {getFieldLabel(field.type)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                           <label className="relative inline-flex items-center cursor-pointer group/toggle p-2">
                              <input
                                type="checkbox"
                                checked={field.isEnabled}
                                onChange={async (e) => {
                                  await api.updateQualificationsField(field.id, { isEnabled: e.target.checked });
                                  await loadSettings();
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/20 rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[10px] after:left-[10px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                            </label>
                          <button
                            onClick={async () => {
                              if(confirm(`Are you sure you want to decommission the ${field.label} field?`)) {
                                await api.deleteQualificationsField(field.id);
                                await loadSettings();
                              }
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-rose-600 hover:text-rose-600 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="rounded-[2.5rem] border border-dashed border-slate-300 bg-slate-100/30 p-16 text-center dark:border-slate-800 dark:bg-slate-900/20">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2.5rem] bg-white text-slate-300 shadow-sm dark:bg-slate-800">
                       <GraduationCap className="h-10 w-10" />
                    </div>
                    <p className="mt-6 text-base font-bold text-slate-950 dark:text-white uppercase tracking-widest">No Academic Fields Defined</p>
                    <p className="mt-2 text-sm font-medium text-slate-500">Initialize qualification protocols to begin education schema definition.</p>
                </div>
              )}

              {/* Add Qualification Field Form (Inline-style) */}
              {showNewQualField && (
                <div className="rounded-[2.5rem] border border-indigo-200 bg-indigo-50/20 p-8 dark:border-indigo-800 dark:bg-indigo-900/10 shadow-sm relative overflow-hidden animate-in fade-in zoom-in-95 duration-300 mt-8">
                  <div className="absolute right-0 top-0 h-32 w-32 -translate-y-12 translate-x-12 rounded-full bg-indigo-500/[0.05] blur-3xl" />
                  <div className="relative flex items-center gap-4 mb-10">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl">
                      <PlusCircle className="h-7 w-7" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-widest">Architect Academic Identity</h4>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">Define New Qualification Attribute</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Structural Handle (ID)</label>
                        <input
                          type="text"
                          value={newQualField.id}
                          onChange={(e) => setNewQualField({ ...newQualField, id: e.target.value })}
                          className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all dark:bg-slate-900 dark:text-white"
                          placeholder="e.g., degree_code"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Visible Nomenclature (Label)</label>
                        <input
                          type="text"
                          value={newQualField.label}
                          onChange={(e) => setNewQualField({ ...newQualField, label: e.target.value })}
                          className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all dark:bg-slate-900 dark:text-white"
                          placeholder="e.g., Qualification Degree"
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Data Protocol (Type)</label>
                        <select
                          value={newQualField.type}
                          onChange={(e) => setNewQualField({ ...newQualField, type: e.target.value as any })}
                          className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 px-6 text-sm font-semibold text-slate-950 shadow-inner focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all dark:bg-slate-900 dark:text-white"
                        >
                          <option value="text">Single Line Text</option>
                          <option value="textarea">Multi-line Text</option>
                          <option value="number">Numeric Value</option>
                          <option value="date">Date Protocol</option>
                          <option value="select">Selection Dropdown</option>
                        </select>
                      </div>
                      <div className="flex bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mt-8">
                         <label className="flex flex-1 items-center justify-between cursor-pointer group/toggle">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 ml-1">Mandatory Validation</span>
                            <div className="relative inline-flex items-center">
                              <input
                                type="checkbox"
                                checked={newQualField.isRequired}
                                onChange={(e) => setNewQualField({ ...newQualField, isRequired: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-500/20 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                            </div>
                          </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 mt-10 pt-10 border-t border-indigo-200 dark:border-indigo-800">
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
                        className="flex-1 rounded-2xl py-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-600 hover:text-slate-950 transition-colors bg-white dark:bg-slate-800"
                      >
                        Abort Registry
                      </button>
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
                      className="flex-[2] rounded-2xl bg-indigo-600 py-4 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-xl transition-all hover:bg-indigo-700 active:scale-[0.98]"
                    >
                      Commit Architectural Context
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-12 overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
           <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50/50 px-8 py-5 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none">
                 <Info className="h-5 w-5" />
              </div>
              <div>
                 <h4 className="text-sm font-bold text-slate-950 dark:text-white uppercase tracking-widest">Architectural Repository Intel</h4>
                 <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Protocol Guidelines & Compliance</p>
              </div>
           </div>
           <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="space-y-4">
                  <div className="flex gap-4 group/info">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors group-hover/info:bg-blue-600 group-hover/info:text-white dark:bg-blue-900/30">
                       <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">System Protocol Enforcement</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">Core system attributes are immutably defined to ensure database integrity. Visual labels may be aliased, but structural handles remain constant.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group/info">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover/info:bg-emerald-600 group-hover/info:text-white dark:bg-emerald-900/30">
                       <Database className="h-3.5 w-3.5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Dynamic Schema Evolution</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">Custom fields and groups can be provisioned or decommissioned in real-time. Changes are immediately broadcast to application gateways.</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-4 group/info">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600 transition-colors group-hover/info:bg-purple-600 group-hover/info:text-white dark:bg-purple-900/30">
                       <Layers className="h-3.5 w-3.5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Nested Logic & Arrays</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">Advanced field typing allows for recursive objects and dynamic arrays, facilitating complex data capture such as academic history or professional timelines.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 group/info">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors group-hover/info:bg-amber-600 group-hover/info:text-white dark:bg-amber-900/30">
                       <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Instructional Latency</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">All modifications commit instantly to the orchestration layer. Ensure schema validation is verified before final execution in production environments.</p>
                    </div>
                  </div>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
