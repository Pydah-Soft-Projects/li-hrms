'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { CertificateUpload } from '@/components/CertificateUpload';
import Spinner from '@/components/Spinner';

interface Field {
  id: string;
  label: string;
  type: string;
  dataType: string;
  isRequired: boolean;
  isSystem: boolean;
  placeholder?: string;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    custom?: string;
  };
  options?: Array<{ label: string; value: string }>;
  itemType?: string;
  itemSchema?: {
    fields: Field[];
  };
  minItems?: number;
  maxItems?: number;
  dateFormat?: string;
  order: number;
  isEnabled: boolean;
}

interface Group {
  id: string;
  label: string;
  description?: string;
  isSystem: boolean;
  isArray: boolean;
  fields: Field[];
  order: number;
  isEnabled: boolean;
}

interface QualificationsField {
  id: string;
  label: string;
  type: string;
  isRequired: boolean;
  isEnabled: boolean;
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  options?: Array<{ label: string; value: string }>;
  order: number;
}

interface QualificationsConfig {
  isEnabled: boolean;
  enableCertificateUpload?: boolean;
  fields: QualificationsField[];
}

interface FormSettings {
  groups: Group[];
  qualifications?: QualificationsConfig;
}

interface DynamicEmployeeFormProps {
  formData: any;
  onChange: (data: any) => void;
  errors?: Record<string, string>;
  departments?: Array<{ _id: string; name: string }>;
  designations?: Array<{ _id: string; name: string; department: string }>;
  divisions?: Array<{ _id: string; name: string }>;
  onSettingsLoaded?: (settings: FormSettings) => void;
  simpleUpload?: boolean;
  isViewMode?: boolean;
  excludeFields?: string[];
}

export default function DynamicEmployeeForm({
  formData,
  onChange,
  errors = {},
  departments = [],
  designations = [],
  onSettingsLoaded,
  simpleUpload = false,
  isViewMode = false,
  divisions = [],
  excludeFields = [],
}: DynamicEmployeeFormProps) {
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Array<{ _id: string; name: string; email: string }>>([]);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.getUsers({ isActive: true });
      if (response.success && response.data) {
        setUsers(response.data);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await api.getFormSettings();
      if (response.success) {
        setSettings(response.data);
        if (onSettingsLoaded) onSettingsLoaded(response.data);
      } else {
        // Try to initialize if settings don't exist
        const initResponse = await api.initializeFormSettings();
        if (initResponse.success) {
          setSettings(initResponse.data);
          if (onSettingsLoaded) onSettingsLoaded(initResponse.data);
        }
      }
    } catch (error) {
      console.error('Error loading form settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId: string, value: any) => {
    const newData = {
      ...formData,
      [fieldId]: value,
    };

    // Cascading logic: Reset department if division changes
    if (fieldId === 'division_id') {
      newData.department_id = '';
      // Optionally reset designation if it's dependent on department
      newData.designation_id = '';
    }

    // Reset designation if department changes
    if (fieldId === 'department_id') {
      newData.designation_id = '';
    }

    onChange(newData);
  };

  const handleArrayItemChange = (fieldId: string, index: number, value: any) => {
    const currentArray = formData[fieldId] || [];
    const newArray = [...currentArray];
    newArray[index] = value;
    handleFieldChange(fieldId, newArray);
  };

  const handleArrayItemAdd = (fieldId: string, itemSchema?: { fields: Field[] }) => {
    const currentArray = formData[fieldId] || [];
    const newItem = itemSchema
      ? itemSchema.fields.reduce((acc, field) => {
        acc[field.id] = field.defaultValue || (field.type === 'number' ? 0 : '');
        return acc;
      }, {} as any)
      : '';
    handleFieldChange(fieldId, [...currentArray, newItem]);
  };

  const handleArrayItemRemove = (fieldId: string, index: number) => {
    const currentArray = formData[fieldId] || [];
    const newArray = currentArray.filter((_: any, i: number) => i !== index);
    handleFieldChange(fieldId, newArray);
  };

  const renderField = (field: Field, groupId: string, arrayIndex?: number) => {
    if (excludeFields.includes(field.id)) return null;

    const fieldId = arrayIndex !== undefined ? `${field.id}[${arrayIndex}]` : field.id;
    const value = arrayIndex !== undefined
      ? formData[field.id]?.[arrayIndex]
      : formData[field.id];
    const error = errors[field.id] || errors[fieldId];
    const fieldKey = `${groupId}-${field.id}${arrayIndex !== undefined ? `-${arrayIndex}` : ''}`;

    // Special handling for division_id, department_id and designation_id
    if (field.id === 'division_id') {
      return (
        <div key={fieldKey}>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {field.label} {field.isRequired && '*'}
          </label>
          <select
            value={value || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.isRequired}
            disabled={isViewMode}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
              }`}
          >
            <option value="">Select Division</option>
            {divisions.map((div) => (
              <option key={div._id} value={div._id}>
                {div.name}
              </option>
            ))}
          </select>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      );
    }

    if (field.id === 'department_id') {
      // Filter departments based on selected division if division_id is set
      let filteredDepartments = departments;
      if (formData.division_id) {
        const selectedDivision = (divisions as any[]).find(d => d._id === formData.division_id);
        if (selectedDivision && selectedDivision.departments) {
          const linkedDeptIds = selectedDivision.departments.map((d: any) => typeof d === 'string' ? d : d._id);
          filteredDepartments = departments.filter(d => linkedDeptIds.includes(d._id));
        } else {
          // If division is selected but has no departments linked, show nothing or all?
          // Usually, if division is selected, we should restrict.
          filteredDepartments = [];
        }
      }

      return (
        <div key={fieldKey}>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {field.label} {field.isRequired && '*'}
          </label>
          <select
            value={value || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.isRequired}
            disabled={isViewMode || (divisions.length > 0 && !formData.division_id)}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
              }`}
          >
            <option value="">{formData.division_id ? 'Select Department' : 'Please select a Division first'}</option>
            {filteredDepartments.map((dept) => (
              <option key={dept._id} value={dept._id}>
                {dept.name}
              </option>
            ))}
          </select>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      );
    }

    if (field.id === 'designation_id') {
      // Show all designations (no department filtering)
      const filteredDesignations = designations;
      return (
        <div key={fieldKey}>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {field.label} {field.isRequired && '*'}
          </label>
          <select
            value={value || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            required={field.isRequired}
            disabled={isViewMode}
            className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
              }`}
          >
            <option value="">Select Designation</option>
            {filteredDesignations.map((desig) => (
              <option key={desig._id} value={desig._id}>
                {desig.name}
              </option>
            ))}
          </select>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      );
    }

    switch (field.type) {
      case 'text':
      case 'tel':
      case 'email':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type={field.type}
              value={value || ''}
              onChange={(e) => {
                const newValue = field.id === 'emp_no' ? e.target.value.toUpperCase() : e.target.value;
                handleFieldChange(field.id, newValue);
              }}
              placeholder={field.placeholder}
              required={field.isRequired}
              maxLength={field.validation?.maxLength}
              disabled={isViewMode}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                } ${field.id === 'emp_no' || field.id === 'ifsc_code' ? 'uppercase' : ''}`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'textarea':
        return (
          <div key={fieldKey} className={field.id === 'address' ? 'sm:col-span-2' : ''}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <textarea
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder}
              required={field.isRequired}
              rows={3}
              maxLength={field.validation?.maxLength}
              disabled={isViewMode}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'number':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type="number"
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value) || 0)}
              placeholder={field.placeholder}
              required={field.isRequired}
              min={field.validation?.min}
              max={field.validation?.max}
              step={field.id === 'proposedSalary' ? '0.01' : '1'}
              disabled={isViewMode}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'date':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type="date"
              value={value ? new Date(value).toISOString().split('T')[0] : ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              required={field.isRequired}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'select':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <select
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value || null)}
              required={field.isRequired}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            >
              <option value="">Select</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'array':
        const arrayValue = formData[field.id] || [];
        return (
          <div key={fieldKey} className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label} {field.isRequired && '*'}
              </label>
              {!isViewMode && (
                <button
                  type="button"
                  onClick={() => handleArrayItemAdd(field.id, field.itemSchema)}
                  className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-green-600"
                >
                  + Add
                </button>
              )}
            </div>

            {arrayValue.map((item: any, index: number) => (
              <div
                key={index}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {field.label} #{index + 1}
                  </span>
                  {!isViewMode && (
                    <button
                      type="button"
                      onClick={() => handleArrayItemRemove(field.id, index)}
                      className="rounded-lg p-1 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {field.itemType === 'object' && field.itemSchema ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {field.itemSchema.fields.map((nestedField) => {
                      const nestedValue = item[nestedField.id];
                      const nestedError = errors[`${field.id}[${index}].${nestedField.id}`];
                      return (
                        <div key={`${fieldKey}-nested-${nestedField.id}`}>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            {nestedField.label} {nestedField.isRequired && '*'}
                          </label>
                          {nestedField.type === 'text' || nestedField.type === 'textarea' ? (
                            nestedField.type === 'textarea' ? (
                              <textarea
                                value={nestedValue || ''}
                                onChange={(e) => {
                                  const newItem = { ...item, [nestedField.id]: e.target.value };
                                  handleArrayItemChange(field.id, index, newItem);
                                }}
                                placeholder={nestedField.placeholder}
                                required={nestedField.isRequired}
                                rows={3}
                                disabled={isViewMode}
                                className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                                  }`}
                              />
                            ) : (
                              <input
                                type={nestedField.type}
                                value={nestedValue || ''}
                                onChange={(e) => {
                                  const newItem = { ...item, [nestedField.id]: e.target.value };
                                  handleArrayItemChange(field.id, index, newItem);
                                }}
                                placeholder={nestedField.placeholder}
                                required={nestedField.isRequired}
                                disabled={isViewMode}
                                className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                                  }`}
                              />
                            )
                          ) : nestedField.type === 'number' ? (
                            <input
                              type="number"
                              value={nestedValue || ''}
                              onChange={(e) => {
                                const newItem = { ...item, [nestedField.id]: parseFloat(e.target.value) || 0 };
                                handleArrayItemChange(field.id, index, newItem);
                              }}
                              placeholder={nestedField.placeholder}
                              required={nestedField.isRequired}
                              min={nestedField.validation?.min}
                              max={nestedField.validation?.max}
                              disabled={isViewMode}
                              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                                }`}
                            />
                          ) : nestedField.type === 'select' ? (
                            <select
                              value={nestedValue || ''}
                              onChange={(e) => {
                                const newItem = { ...item, [nestedField.id]: e.target.value || null };
                                handleArrayItemChange(field.id, index, newItem);
                              }}
                              required={nestedField.isRequired}
                              disabled={isViewMode}
                              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                                }`}
                            >
                              <option value="">Select</option>
                              {nestedField.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {nestedError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nestedError}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type={field.itemType === 'number' ? 'number' : 'text'}
                    value={item || ''}
                    onChange={(e) => {
                      const newValue = field.itemType === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                      handleArrayItemChange(field.id, index, newValue);
                    }}
                    placeholder={field.placeholder}
                    disabled={isViewMode}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
            ))}

            {arrayValue.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">No items added yet</p>
            )}
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'email':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type="email"
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || 'example@email.com'}
              required={field.isRequired}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'tel':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type="tel"
              value={value || ''}
              onChange={(e) => handleFieldChange(field.id, e.target.value)}
              placeholder={field.placeholder || '+91 1234567890'}
              required={field.isRequired}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'file':
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  // Store file name for now, you can enhance this to upload and store file URL
                  handleFieldChange(field.id, file.name);
                }
              }}
              required={field.isRequired}
              className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                }`}
            />
            {value && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Selected: {value}</p>}
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'multiselect':
        const multiValue = Array.isArray(value) ? value : value ? [value] : [];
        return (
          <div key={fieldKey}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <div className="space-y-2">
              {field.options?.map((opt) => {
                const isChecked = multiValue.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        let newValue: any[] = [...multiValue];
                        if (e.target.checked) {
                          if (!newValue.includes(opt.value)) {
                            newValue.push(opt.value);
                          }
                        } else {
                          newValue = newValue.filter((v) => v !== opt.value);
                        }
                        handleFieldChange(field.id, newValue);
                      }}
                      disabled={isViewMode}
                      className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'object':
        const objectValue = value || {};
        if (!field.itemSchema?.fields) {
          return (
            <div key={fieldKey} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Object field "{field.label}" requires itemSchema configuration
              </p>
            </div>
          );
        }
        return (
          <div key={fieldKey} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
            </label>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field.itemSchema.fields.map((nestedField) => {
                  const nestedValue = objectValue[nestedField.id];
                  const nestedError = errors[`${field.id}.${nestedField.id}`];
                  return (
                    <div key={nestedField.id}>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {nestedField.label} {nestedField.isRequired && '*'}
                      </label>
                      {nestedField.type === 'text' || nestedField.type === 'email' || nestedField.type === 'tel' ? (
                        <input
                          type={nestedField.type}
                          value={nestedValue || ''}
                          onChange={(e) => {
                            handleFieldChange(field.id, {
                              ...objectValue,
                              [nestedField.id]: e.target.value,
                            });
                          }}
                          placeholder={nestedField.placeholder}
                          required={nestedField.isRequired}
                          disabled={isViewMode}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                            }`}
                        />
                      ) : nestedField.type === 'textarea' ? (
                        <textarea
                          value={nestedValue || ''}
                          onChange={(e) => {
                            handleFieldChange(field.id, {
                              ...objectValue,
                              [nestedField.id]: e.target.value,
                            });
                          }}
                          placeholder={nestedField.placeholder}
                          required={nestedField.isRequired}
                          rows={3}
                          disabled={isViewMode}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                            }`}
                        />
                      ) : nestedField.type === 'number' ? (
                        <input
                          type="number"
                          value={nestedValue || ''}
                          onChange={(e) => {
                            handleFieldChange(field.id, {
                              ...objectValue,
                              [nestedField.id]: parseFloat(e.target.value) || 0,
                            });
                          }}
                          placeholder={nestedField.placeholder}
                          required={nestedField.isRequired}
                          min={nestedField.validation?.min}
                          max={nestedField.validation?.max}
                          disabled={isViewMode}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                            }`}
                        />
                      ) : nestedField.type === 'date' ? (
                        <input
                          type="date"
                          value={nestedValue ? new Date(nestedValue).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            handleFieldChange(field.id, {
                              ...objectValue,
                              [nestedField.id]: e.target.value,
                            });
                          }}
                          required={nestedField.isRequired}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                            }`}
                        />
                      ) : nestedField.type === 'select' ? (
                        <select
                          value={nestedValue || ''}
                          onChange={(e) => {
                            handleFieldChange(field.id, {
                              ...objectValue,
                              [nestedField.id]: e.target.value || null,
                            });
                          }}
                          required={nestedField.isRequired}
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${nestedError ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                            }`}
                        >
                          <option value="">Select</option>
                          {nestedField.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {nestedError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{nestedError}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      case 'userselect':
        const selectedUserIds = Array.isArray(value) ? value : value ? [value] : [];
        const maxUsers = (field.validation as any)?.maxItems || 2;
        return (
          <div key={fieldKey} className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              {field.label} {field.isRequired && '*'}
              {maxUsers > 1 && (
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  (Select up to {maxUsers})
                </span>
              )}
            </label>
            <div className="space-y-2">
              {users.map((user) => {
                const isSelected = selectedUserIds.includes(user._id);
                const canSelect = isSelected || selectedUserIds.length < maxUsers;
                return (
                  <label
                    key={user._id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${isSelected
                      ? 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-900/20'
                      : canSelect
                        ? 'border-slate-200 bg-white hover:border-green-200 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                        : 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed dark:border-slate-700 dark:bg-slate-900/50'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        let newValue: string[] = [...selectedUserIds];
                        if (e.target.checked) {
                          if (!newValue.includes(user._id) && newValue.length < maxUsers) {
                            newValue.push(user._id);
                          }
                        } else {
                          newValue = newValue.filter((id) => id !== user._id);
                        }
                        handleFieldChange(field.id, newValue);
                      }}
                      disabled={!canSelect || isViewMode}
                      className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{user.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                    </div>
                    {isSelected && (
                      <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </label>
                );
              })}
              {selectedUserIds.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedUserIds.length} of {maxUsers} selected
                </p>
              )}
            </div>
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Form settings not found. Please initialize settings first.
      </div>
    );
  }

  // Sort groups by desired priority first, then by their own order
  const groupPriority: Record<string, number> = {
    basic_info: 1,
    personal_info: 2,
    contact_info: 3,
    bank_details: 4,
  };
  const sortedGroups = [...settings.groups]
    .filter((g) => g.isEnabled)
    .sort((a, b) => {
      const pa = groupPriority[a.id] ?? 5;
      const pb = groupPriority[b.id] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.order - b.order;
    });

  // Render qualifications section
  const renderQualifications = () => {
    if (!settings.qualifications || !settings.qualifications.isEnabled) {
      return null;
    }

    const qualFields = settings.qualifications.fields
      .filter((f) => f.isEnabled)
      .sort((a, b) => a.order - b.order);

    if (qualFields.length === 0) {
      return null;
    }

    const qualifications = formData.qualifications || [];

    const handleQualificationChange = (index: number, fieldId: string, value: any) => {
      const newQualifications = [...qualifications];
      if (!newQualifications[index]) {
        newQualifications[index] = {};
      }
      newQualifications[index] = {
        ...newQualifications[index],
        [fieldId]: value,
      };
      handleFieldChange('qualifications', newQualifications);
    };

    const handleAddQualification = () => {
      const newQual = qualFields.reduce((acc, field) => {
        acc[field.id] = field.type === 'number' ? 0 : '';
        return acc;
      }, {} as any);
      handleFieldChange('qualifications', [...qualifications, newQual]);
    };

    const handleRemoveQualification = (index: number) => {
      const newQualifications = qualifications.filter((_: any, i: number) => i !== index);
      handleFieldChange('qualifications', newQualifications);
    };

    const renderQualificationField = (field: QualificationsField, qualIndex: number) => {
      if (excludeFields.includes(field.id)) return null;

      const value = qualifications[qualIndex]?.[field.id] || '';
      const error = errors[`qualifications[${qualIndex}].${field.id}`];

      switch (field.type) {
        case 'text':
        case 'textarea':
          return (
            <div key={field.id}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label} {field.isRequired && '*'}
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={value}
                  onChange={(e) => handleQualificationChange(qualIndex, field.id, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.isRequired}
                  rows={3}
                  disabled={isViewMode}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                    }`}
                />
              ) : (
                <input
                  type={field.type}
                  value={value}
                  onChange={(e) => handleQualificationChange(qualIndex, field.id, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.isRequired}
                  disabled={isViewMode}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                    }`}
                />
              )}
              {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
          );

        case 'number':
          return (
            <div key={field.id}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label} {field.isRequired && '*'}
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => handleQualificationChange(qualIndex, field.id, parseFloat(e.target.value) || 0)}
                placeholder={field.placeholder}
                required={field.isRequired}
                min={field.validation?.min}
                max={field.validation?.max}
                disabled={isViewMode}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                  }`}
              />
              {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
          );

        case 'date':
          return (
            <div key={field.id}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label} {field.isRequired && '*'}
              </label>
              <input
                type="date"
                value={value}
                onChange={(e) => handleQualificationChange(qualIndex, field.id, e.target.value)}
                required={field.isRequired}
                disabled={isViewMode}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                  }`}
              />
              {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
          );

        case 'select':
          return (
            <div key={field.id}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {field.label} {field.isRequired && '*'}
              </label>
              <select
                value={value}
                onChange={(e) => handleQualificationChange(qualIndex, field.id, e.target.value)}
                required={field.isRequired}
                disabled={isViewMode}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${error ? 'border-red-300 dark:border-red-700' : 'border-slate-200 bg-white'
                  }`}
              >
                <option value="">Select</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
          );

        default:
          return null;
      }
    };

    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Qualifications
        </h3>
        <div className="space-y-4">
          {qualifications.map((qual: any, index: number) => (
            <div
              key={index}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Qualification {index + 1}
                </h4>
                {!isViewMode && (
                  <button
                    type="button"
                    onClick={() => handleRemoveQualification(index)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {qualFields.map((field) => renderQualificationField(field, index))}
              </div>

              {/* Certificate Upload - Only show if enabled in settings */}
              {settings.qualifications?.enableCertificateUpload && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  {simpleUpload ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Certificate (Image/PDF)
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          handleQualificationChange(index, 'certificateFile', file);
                        }}
                        disabled={isViewMode}
                        className="block w-full text-sm text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-sm file:font-semibold
                          file:bg-green-50 file:text-green-700
                          hover:file:bg-green-100 dark:file:bg-green-900/20 dark:file:text-green-400"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Upload qualification certificate
                      </p>
                    </div>
                  ) : (
                    <CertificateUpload
                      qualificationIndex={index}
                      certificateUrl={qualifications[index]?.certificateUrl}
                      onFileChange={(file) => {
                        handleQualificationChange(index, 'certificateFile', file);
                      }}
                      onDelete={() => {
                        handleQualificationChange(index, 'certificateFile', null);
                        // Also clear the URL so it doesn't show up again
                        handleQualificationChange(index, 'certificateUrl', '');
                      }}
                      isViewMode={isViewMode}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
          {!isViewMode && (
            <button
              type="button"
              onClick={handleAddQualification}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-green-400 hover:bg-green-50 hover:text-green-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-green-500 dark:hover:bg-green-900/20 dark:hover:text-green-400"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Qualification
            </button>
          )}
        </div>
      </div>
    );
  };

  const qualificationsBlock = renderQualifications();

  return (
    <div className="space-y-6">
      {sortedGroups.map((group) => {
        // Sort fields by order
        const sortedFields = [...group.fields]
          .filter((f) => f.isEnabled)
          .sort((a, b) => a.order - b.order);

        if (sortedFields.length === 0) return null;

        return (
          <div key={group.id}>
            <div
              className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50"
            >
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {group.label}
              </h3>
              {group.description && (
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{group.description}</p>
              )}

              <div
                className={`grid grid-cols-1 gap-4 ${group.id === 'basic_info'
                  ? 'sm:grid-cols-2 lg:grid-cols-3'
                  : group.id === 'personal_info'
                    ? 'sm:grid-cols-2 lg:grid-cols-4'
                    : group.id === 'contact_info'
                      ? 'sm:grid-cols-2 lg:grid-cols-4'
                      : group.id === 'bank_details'
                        ? 'sm:grid-cols-2 lg:grid-cols-4'
                        : group.id === 'reporting_authority'
                          ? 'sm:grid-cols-1'
                          : 'sm:grid-cols-2'
                  }`}
              >
                {sortedFields.map((field) => renderField(field, group.id))}
              </div>
            </div>

            {/* Render qualifications immediately after personal info */}
            {group.id === 'personal_info' && qualificationsBlock && (
              <div className="mt-6">{qualificationsBlock}</div>
            )}
          </div>
        );
      })}
      {/* If no personal info group exists, still show qualifications at the end */}
      {!sortedGroups.some((g) => g.id === 'personal_info') && qualificationsBlock}
    </div>
  );
}

