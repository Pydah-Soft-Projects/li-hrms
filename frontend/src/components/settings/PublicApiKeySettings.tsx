'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Code2,
  Layers,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
} from '@/components/settings/SettingsPageShell';
import { SettingsSkeleton } from './SettingsSkeleton';

interface ApiKeyItem {
  _id: string;
  key: string;
  clientName: string;
  allowedFields: string[];
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface AvailableField {
  id: string;
  label: string;
  group: string;
  defaultSelected?: boolean;
}

const DEFAULT_FIELDS: AvailableField[] = [
  { id: 'emp_no', label: 'Employee ID (emp_no / empNo)', group: 'Basic Info', defaultSelected: true },
  { id: 'employee_name', label: 'Full Name (employee_name / name)', group: 'Basic Info', defaultSelected: true },
  { id: 'status', label: 'Employment Status (status / isActive)', group: 'Basic Info', defaultSelected: true },
  { id: 'email', label: 'Email Address', group: 'Contact', defaultSelected: false },
  { id: 'phone_number', label: 'Phone Number', group: 'Contact', defaultSelected: false },
  { id: 'division', label: 'Division Name (division / division_name)', group: 'Organization', defaultSelected: false },
  { id: 'department', label: 'Department Name (department / department_name)', group: 'Organization', defaultSelected: false },
  { id: 'designation', label: 'Designation Name (designation / designation_name)', group: 'Organization', defaultSelected: false },
  { id: 'gender', label: 'Gender', group: 'Personal', defaultSelected: false },
  { id: 'dob', label: 'Date of Birth', group: 'Personal', defaultSelected: false },
  { id: 'doj', label: 'Date of Joining', group: 'Organization', defaultSelected: false },
  { id: 'blood_group', label: 'Blood Group', group: 'Personal', defaultSelected: false },
  { id: 'marital_status', label: 'Marital Status', group: 'Personal', defaultSelected: false },
];

export default function PublicApiKeySettings() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [availableFields, setAvailableFields] = useState<AvailableField[]>(DEFAULT_FIELDS);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyItem | null>(null);
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>(['emp_no', 'employee_name', 'status']);
  const [submitting, setSubmitting] = useState(false);

  // Newly generated key display
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKeyItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [keysRes, fieldsRes] = await Promise.all([
        api.getPublicApiKeys(),
        api.getPublicApiKeyFields().catch(() => null),
      ]);

      if (keysRes.success && Array.isArray(keysRes.data)) {
        setKeys(keysRes.data);
      }
      if (fieldsRes && fieldsRes.success && Array.isArray(fieldsRes.data)) {
        setAvailableFields(fieldsRes.data);
      }
    } catch (err: any) {
      console.error('Error loading API keys:', err);
      toast.error('Failed to load public API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingKey(null);
    setClientName('');
    setDescription('');
    setSelectedFields(['emp_no', 'employee_name', 'status']);
    setShowModal(true);
  };

  const openEditModal = (item: ApiKeyItem) => {
    setEditingKey(item);
    setClientName(item.clientName || '');
    setDescription(item.description || '');
    setSelectedFields(item.allowedFields || ['emp_no', 'employee_name', 'status']);
    setShowModal(true);
  };

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleSelectAll = () => {
    setSelectedFields(availableFields.map((f) => f.id));
  };

  const handleSelectDefaults = () => {
    setSelectedFields(['emp_no', 'employee_name', 'status']);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (selectedFields.length === 0) {
      toast.error('Please select at least one field');
      return;
    }

    try {
      setSubmitting(true);
      if (editingKey) {
        // Update existing
        const res = await api.updatePublicApiKey(editingKey._id, {
          clientName: clientName.trim(),
          description: description.trim(),
          allowedFields: selectedFields,
        });
        if (res.success) {
          toast.success('API Key updated successfully');
          setShowModal(false);
          loadData();
        } else {
          toast.error(res.message || 'Failed to update API key');
        }
      } else {
        // Create new
        const res = await api.createPublicApiKey({
          clientName: clientName.trim(),
          description: description.trim(),
          allowedFields: selectedFields,
        });
        if (res.success && res.data) {
          toast.success('API Key generated successfully');
          setNewlyCreatedKey(res.data);
          setShowModal(false);
          loadData();
        } else {
          toast.error(res.message || 'Failed to generate API key');
        }
      }
    } catch (err: any) {
      console.error('Error saving API key:', err);
      toast.error(err.message || 'Failed to save API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: ApiKeyItem) => {
    try {
      const res = await api.updatePublicApiKey(item._id, {
        isActive: !item.isActive,
      });
      if (res.success) {
        toast.success(`Key ${!item.isActive ? 'activated' : 'deactivated'}`);
        setKeys((prev) =>
          prev.map((k) => (k._id === item._id ? { ...k, isActive: !item.isActive } : k))
        );
      }
    } catch (err: any) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (item: ApiKeyItem) => {
    if (!confirm(`Are you sure you want to delete and revoke the API key for "${item.clientName}"? Any external application using this key will immediately lose access.`)) {
      return;
    }
    try {
      const res = await api.deletePublicApiKey(item._id);
      if (res.success) {
        toast.success('API Key revoked');
        setKeys((prev) => prev.filter((k) => k._id !== item._id));
        if (newlyCreatedKey?._id === item._id) {
          setNewlyCreatedKey(null);
        }
      }
    } catch (err: any) {
      toast.error('Failed to delete API key');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  if (loading) {
    return <SettingsSkeleton />;
  }

  // Group available fields for clean UI
  const groupedFields = availableFields.reduce((acc, field) => {
    const grp = field.group || 'Other';
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(field);
    return acc;
  }, {} as Record<string, AvailableField[]>);

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Public API Keys & Field Selection"
        subtitle="Manage external consumer access tokens with strict, granular field-level exposure controls"
      />

      {/* Action Bar */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <KeyRound className="w-4 h-4 text-indigo-500" />
          <span>Active integration keys: <strong>{keys.filter((k) => k.isActive).length}</strong></span>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate New API Key
        </button>
      </div>

      {/* Newly Created Key Alert Box */}
      {newlyCreatedKey && (
        <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-emerald-900">New API Key Generated for {newlyCreatedKey.clientName}</h4>
                <p className="text-xs text-emerald-700">
                  Please copy and securely share this key with the client. It must be provided in the <code className="bg-emerald-100 px-1 py-0.5 rounded">x-api-key</code> header.
                </p>
              </div>
            </div>
            <button
              onClick={() => setNewlyCreatedKey(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
            >
              Dismiss
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-emerald-200">
            <code className="flex-1 font-mono text-sm text-slate-800 break-all select-all">
              {newlyCreatedKey.key}
            </code>
            <button
              onClick={() => handleCopy(newlyCreatedKey.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium transition-colors"
            >
              {copiedKey === newlyCreatedKey.key ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copy Key
                </>
              )}
            </button>
          </div>

          <div className="text-xs text-emerald-800 flex items-center gap-2">
            <span><strong>Allowed Fields:</strong></span>
            <div className="flex flex-wrap gap-1">
              {newlyCreatedKey.allowedFields.map((f) => (
                <span key={f} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-mono">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      <SettingsSectionCard
        title="Registered Client Keys"
        description="Keys listed here can authenticate to GET /api/employees/public to retrieve employee data"
      >
        {keys.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <KeyRound className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-slate-600">No API keys created yet</p>
            <p className="text-xs text-slate-400 mt-1">Generate your first API key above to allow external systems to fetch employee data.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {keys.map((item) => (
              <div key={item._id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{item.clientName}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        item.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Created: {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-500">{item.description}</p>
                  )}

                  {/* Key preview & Copy */}
                  <div className="flex items-center gap-2 pt-1">
                    <code className="text-xs font-mono bg-slate-50 px-2.5 py-1 rounded border border-slate-200 text-slate-700 select-all">
                      {item.key}
                    </code>
                    <button
                      onClick={() => handleCopy(item.key)}
                      title="Copy Key"
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {copiedKey === item.key ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Configured fields tags */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-400 font-medium">Fields:</span>
                    {item.allowedFields && item.allowedFields.length > 0 ? (
                      item.allowedFields.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-[11px] rounded font-mono"
                        >
                          {f}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Default (emp_no, employee_name, status)</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-start md:self-center">
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      item.isActive
                        ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    {item.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => openEditModal(item)}
                    title="Edit Allowed Fields"
                    className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    title="Revoke / Delete Key"
                    className="p-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSectionCard>

      {/* Integration Reference Card */}
      <SettingsSectionCard
        title="Integration Guide & Usage"
        description="How external applications authenticate and receive the configured fields"
      >
        <div className="space-y-3 text-xs text-slate-600">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[12px] space-y-1">
            <p className="text-slate-500 font-sans font-semibold">Endpoint:</p>
            <p className="text-indigo-600 font-bold">GET /api/employees/public</p>
            <p className="text-slate-500 font-sans font-semibold pt-2">Headers:</p>
            <p>x-api-key: lihrms_&lt;YOUR_API_KEY&gt;</p>
            <p>Content-Type: application/json</p>
          </div>

          <div className="flex items-start gap-2 text-slate-500 pt-1">
            <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <p>
              Each API key strictly controls which employee fields are exposed to that client. If you update the allowed fields for a key, the response changes automatically on the very next request with no client code modification needed.
            </p>
          </div>
        </div>
      </SettingsSectionCard>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-base">
                  {editingKey ? `Edit Allowed Fields: ${editingKey.clientName}` : 'Generate Public API Key'}
                </h3>
                <p className="text-xs text-slate-500">
                  Select which employee data fields this external client will be permitted to access.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto p-5 space-y-5 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client / Integration Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Biometric Attendance Machine, Mobile App, External ERP"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Purpose (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. For syncing employees with the front gate attendance system"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Field Selection Grouped */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    Select Allowed Response Fields ({selectedFields.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSelectDefaults}
                      className="text-[11px] text-indigo-600 hover:underline"
                    >
                      Default
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-[11px] text-indigo-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFields([])}
                      className="text-[11px] text-slate-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-4 border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 max-h-64 overflow-y-auto">
                  {Object.entries(groupedFields).map(([groupName, fields]) => (
                    <div key={groupName} className="space-y-2">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {groupName}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {fields.map((f) => {
                          const isChecked = selectedFields.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-indigo-50/60 border-indigo-200 text-indigo-900 font-medium'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleFieldToggle(f.id)}
                                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                              />
                              <div className="leading-tight">
                                <div>{f.label}</div>
                                <code className="text-[10px] text-slate-400 font-mono">{f.id}</code>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors shadow-sm"
                >
                  {submitting
                    ? 'Saving...'
                    : editingKey
                    ? 'Update Key Fields'
                    : 'Generate API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
