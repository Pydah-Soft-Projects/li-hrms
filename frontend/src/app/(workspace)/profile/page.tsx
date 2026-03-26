'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import Spinner from '@/components/Spinner';
import { User, Mail, Phone, Briefcase, Calendar, Shield, Key, Building, MapPin, X, RefreshCw, AlertTriangle, Check, Clock } from 'lucide-react';

interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  department?: { _id: string; name: string };
  employeeId?: string;
  emp_no?: string;
  phone?: string;
  isActive?: boolean;
  is_active?: boolean;
  createdAt: string;
  lastLogin?: string;
  profilePhoto?: string | null;
}

interface EmployeeProfile {
  _id: string;
  emp_no: string;
  employee_name: string;
  joining_date?: string;
  designation?: { name: string };
  department?: { name: string };
  division?: { name: string };
  reporting_manager?: { employee_name: string };
  shiftId?: { name: string; startTime: string; endTime: string };
  employment_status?: string;
  blood_group?: string;
  personal_email?: string;
  address?: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'employment' | 'security'>('profile');

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile Update Request state
  const [updateConfig, setUpdateConfig] = useState<any>(null);
  const [formGroups, setFormGroups] = useState<any[]>([]);
  const [allDivisions, setAllDivisions] = useState<any[]>([]);
  const [allDepartments, setAllDepartments] = useState<any[]>([]);
  const [allDesignations, setAllDesignations] = useState<any[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestedChanges, setRequestedChanges] = useState<any>({});
  const [requestComments, setRequestComments] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchUserProfile = async () => {
    try {
      const response = await api.getCurrentUser();
      if (response.success && response.data) {
        const userData = response.data.user;
        setUser(userData);
        setEditData({
          name: userData.name || '',
          phone: userData.phone || '',
        });

        // Fetch Employee Details if applicable
        const empIdentifier = (userData as any).emp_no || userData.employeeId;
        if (empIdentifier) {
          try {
            const empRes = await api.getEmployee(empIdentifier);
            if (empRes.success && empRes.data) {
              setEmployee(empRes.data);
            }
          } catch (err) {
            console.error('Error fetching linked employee profile:', err);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setToast({ type: 'error', message: 'Failed to load profile' });
    } finally {
      setLoading(false);
    }

    // Fetch Profile Update Configuration
    try {
      const [configRes, formRes, divisionsRes, departmentsRes, designationsRes] = await Promise.all([
        api.getSetting('profile_update_request_config'),
        api.getFormSettings(),
        api.getDivisions(undefined, undefined, true),
        api.getDepartments(undefined, undefined, true),
        api.getAllDesignations()
      ]);

      if (configRes.success && configRes.data) {
        setUpdateConfig(configRes.data.value);
      }

      if (formRes.success && formRes.data) {
        setFormGroups(formRes.data.groups);
      }

      if (divisionsRes.success && Array.isArray(divisionsRes.data)) {
        setAllDivisions(divisionsRes.data);
      }

      if (departmentsRes.success && Array.isArray(departmentsRes.data)) {
        setAllDepartments(departmentsRes.data);
      }

      if (designationsRes.success && Array.isArray(designationsRes.data)) {
        setAllDesignations(designationsRes.data);
      }
    } catch (err) {
      console.error('Error fetching update config:', err);
    }
  };

  const handleSubmitUpdateRequest = async () => {
    if (Object.keys(requestedChanges).length === 0) {
      setToast({ type: 'error', message: 'No changes requested' });
      return;
    }

    setSubmittingRequest(true);
    // Filter only fields that have actually changed
    const filteredChanges: any = {};
    Object.keys(requestedChanges).forEach(key => {
      const currentRawValue = getRawFieldValue(key);
      const normalizedCurrent = normalizeFieldValueForInput(key, currentRawValue);
      const normalizedRequested = normalizeFieldValueForInput(key, requestedChanges[key]);
      if (String(normalizedRequested ?? '') !== String(normalizedCurrent ?? '')) {
        filteredChanges[key] = requestedChanges[key];
      }
    });

    if (Object.keys(filteredChanges).length === 0) {
      setToast({ type: 'error', message: 'Please modify at least one field to request an update.' });
      setSubmittingRequest(false);
      return;
    }

    try {
      const response = await api.createEmployeeUpdateRequest({
        requestedChanges: filteredChanges,
        comments: requestComments
      });
      if (response.success) {
        setToast({ type: 'success', message: 'Update request submitted successfully' });
        setShowRequestModal(false);
        setRequestedChanges({});
        setRequestComments('');
      } else {
        setToast({ type: 'error', message: response.message || 'Failed to submit request' });
      }
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to submit request' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editData.name.trim()) {
      setToast({ type: 'error', message: 'Name is required' });
      return;
    }

    setSaving(true);
    try {
      const response = await api.updateProfile(editData);
      if (response.success) {
        setUser((prev) => (prev ? { ...prev, ...editData } : null));
        // Update local storage user data
        const currentUser = auth.getUser();
        if (currentUser) {
          auth.setUser({ ...currentUser, name: editData.name });
        }
        setIsEditing(false);
        setToast({ type: 'success', message: 'Profile updated successfully' });
      } else {
        setToast({ type: 'error', message: response.message || 'Failed to update profile' });
      }
    } catch (error: any) {
      setToast({ type: 'error', message: error.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validation
    if (!passwordData.currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (!passwordData.newPassword) {
      setPasswordError('New password is required');
      return;
    }
    if (passwordData.newPassword.length < 4) {
      setPasswordError('New password must be at least 4 characters');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordData.currentPassword === passwordData.newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setPasswordLoading(true);
    try {
      const response = await api.changePassword(passwordData.currentPassword, passwordData.newPassword);
      if (response.success) {
        setPasswordSuccess('Password changed successfully!');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(response.message || 'Failed to change password');
      }
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      sub_admin: 'Sub Admin',
      hr: 'HR Manager',
      hod: 'Head of Department',
      employee: 'Employee',
      manager: 'Manager',
    };
    return labels[role] || role;
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      sub_admin: 'bg-blue-100 text-blue-700 border-blue-200',
      hr: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      hod: 'bg-amber-100 text-amber-700 border-amber-200',
      manager: 'bg-orange-100 text-orange-700 border-orange-200',
      employee: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return colors[role] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const formatDate = (dateString?: string, includeTime = true) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...(includeTime && { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const isDateLike = (value: string) => {
    if (!value) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return true;
    return false;
  };

  const getPrimitiveValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
      return value
        .map((item) => getPrimitiveValue(item))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof value === 'object') {
      const preferredKeys = ['name', 'label', 'title', 'employee_name', 'emp_no', 'code', 'value'];
      for (const key of preferredKeys) {
        if (value[key] !== undefined && value[key] !== null && value[key] !== '') {
          return String(value[key]);
        }
      }
      return '';
    }
    return String(value);
  };

  const formatFieldValue = (value: any): string => {
    const primitive = getPrimitiveValue(value);
    if (!primitive) return '—';
    if (isDateLike(primitive)) return formatDate(primitive, false);
    return primitive;
  };

  const getFieldDefinition = (fieldId: string) => {
    for (const group of formGroups) {
      const field = group?.fields?.find((f: any) => f.id === fieldId);
      if (field) return field;
    }
    return null;
  };

  const fieldAliases: Record<string, string[]> = {
    phone: ['phone_number', 'contact_number', 'mobile_number'],
    phone_number: ['phone', 'contact_number', 'mobile_number'],
    contact_number: ['phone_number', 'phone', 'mobile_number'],
    personal_email: ['email'],
    email: ['personal_email'],
    date_of_birth: ['dob', 'birth_date'],
    dob: ['date_of_birth', 'birth_date'],
    joining_date: ['doj', 'date_of_joining'],
    doj: ['joining_date', 'date_of_joining'],
    designation: ['designation_id'],
    designation_id: ['designation'],
    department: ['department_id'],
    department_id: ['department'],
    division: ['division_id'],
    division_id: ['division'],
  };

  const firstDefined = (...values: any[]) => {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };

  const getRawFieldValue = (fieldId: string): any => {
    const aliases = fieldAliases[fieldId] || [];
    const candidateKeys = [fieldId, ...aliases];

    for (const key of candidateKeys) {
      const value = firstDefined(
        (user as any)?.[key],
        (employee as any)?.[key],
        (employee as any)?.dynamicFields?.[key]
      );
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const toDateInputValue = (value: any): string => {
    const raw = getPrimitiveValue(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const toSelectInputValue = (rawValue: any, field: any): string => {
    const options = getFieldOptionsForRequest(field);
    const primitive = getPrimitiveValue(rawValue);
    const objectCandidates = rawValue && typeof rawValue === 'object'
      ? [rawValue._id, rawValue.id, rawValue.value, rawValue.code, rawValue.name, rawValue.label]
      : [];
    const candidates = [...objectCandidates, primitive]
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map((v) => String(v).trim().toLowerCase());

    if (candidates.length === 0) return '';
    const matched = options.find((opt: any) => {
      const optValue = String(opt?.value ?? '').trim().toLowerCase();
      const optLabel = String(opt?.label ?? '').trim().toLowerCase();
      return candidates.includes(optValue) || candidates.includes(optLabel);
    });

    if (matched) return String(matched.value ?? '');
    return primitive || '';
  };

  const normalizeFieldValueForInput = (fieldId: string, rawValue: any): string => {
    const field = getFieldDefinition(fieldId);
    if (!field) return getPrimitiveValue(rawValue);

    if (field.type === 'date') return toDateInputValue(rawValue);
    if (field.type === 'select' || field.type === 'dropdown') return toSelectInputValue(rawValue, field);
    return getPrimitiveValue(rawValue);
  };

  const getFieldOptionsForRequest = (field: any) => {
    const fieldId = String(field?.id || '').toLowerCase();
    if (fieldId === 'division' || fieldId === 'division_id') {
      return allDivisions.map((d: any) => ({ value: String(d._id), label: d.name || d.code || String(d._id) }));
    }
    if (fieldId === 'department' || fieldId === 'department_id') {
      return allDepartments.map((d: any) => ({ value: String(d._id), label: d.name || d.code || String(d._id) }));
    }
    if (fieldId === 'designation' || fieldId === 'designation_id') {
      return allDesignations.map((d: any) => ({ value: String(d._id), label: d.name || d.code || String(d._id) }));
    }
    return field?.options || [];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-slate-500 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 text-lg">Unable to load profile</p>
          <button
            onClick={fetchUserProfile}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-xl animate-slide-in ${toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
            }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' ? (
              <Shield className="w-5 h-5" />
            ) : (
              <Shield className="w-5 h-5" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
          {/* <p className="text-slate-500 mt-1">View and manage your account and employment details</p> */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-8">
              {/* Cover Gradient - blue to teal/green */}
              <div className="h-24 bg-gradient-to-r from-blue-600 via-blue-500 to-teal-500 relative">
                {/* Active badge - top right, light background, green dot */}
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-100/95 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-200/80">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${user.isActive || user.is_active !== false ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-medium text-slate-700">
                    {user.isActive || user.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Avatar & Basic Info - photo overlaps header with white border */}
              <div className="px-6 pb-6 text-center -mt-12 relative">
                <div className="w-24 h-24 mx-auto rounded-full bg-white border-4 border-white shadow-xl relative group ring-2 ring-slate-200/50">
                  {user.profilePhoto ? (
                    <img src={user.profilePhoto} alt={user.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-4xl font-bold text-slate-400">
                      {user.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <label className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-white text-xs font-medium px-2 text-center">Change photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/jpg"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const res = await api.uploadProfile(file) as { success?: boolean; url?: string };
                          if (res?.success && res?.url) {
                            await api.updateProfile({ profilePhoto: res.url });
                            setUser(prev => prev ? { ...prev, profilePhoto: res.url } : null);
                            setToast({ type: 'success', message: 'Profile photo updated' });
                          }
                        } catch (err) {
                          setToast({ type: 'error', message: 'Failed to upload photo' });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{user.name}</h2>
                  <p className="text-slate-500 text-sm mt-1">{user.email}</p>
                </div>

                {/* Role & Department - pill tags, light grey bg and border */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                    {getRoleLabel(user.role)}
                  </span>
                  {user.department && (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                      {user.department.name}
                    </span>
                  )}
                </div>

                {/* Joined & Last Login - labels uppercase light grey, values dark */}
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-left">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Joined</p>
                    <p className="text-xs font-medium text-slate-800">{user.createdAt ? formatDate(user.createdAt, false) : '—'}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Last Login</p>
                    <p className="text-xs font-medium text-slate-800">{user.lastLogin ? formatDate(user.lastLogin, true) : 'Never'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Information Tabs */}
          <div className="lg:col-span-8">
            {/* Tabs Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6 flex flex-col sm:flex-row">
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                  ${activeTab === 'profile' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <User className="w-4 h-4" />
                Personal Profile
              </button>
              <button
                onClick={() => setActiveTab('employment')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                  ${activeTab === 'employment' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Briefcase className="w-4 h-4" />
                Employment Details
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                  ${activeTab === 'security' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Shield className="w-4 h-4" />
                Security
              </button>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">

              {/* PROFILE TAB */}
              {activeTab === 'profile' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Personal Information
                    </h3>
                    {!isEditing && user.role !== 'employee' && (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors"
                      >
                        Edit Details
                      </button>
                    )}
                    {isEditing && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditData({ name: user.name, phone: user.phone || '' });
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="group">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.name}
                          onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      ) : (
                        <div className="text-base font-medium text-slate-800 flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          {user.name}
                        </div>
                      )}
                    </div>

                    <div className="group">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                      <div className="text-base font-medium text-slate-800 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-transparent group-hover:border-slate-200 transition-colors">
                        <Mail className="w-4 h-4 text-slate-400" />
                        {user.email}
                      </div>
                    </div>

                    <div className="group">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone Number</label>
                      {isEditing ? (
                        <input
                          type="tel"
                          value={editData.phone}
                          onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="+91..."
                        />
                      ) : (
                        <div className="text-base font-medium text-slate-800 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {user.phone || <span className="text-slate-400 italic">Not added</span>}
                        </div>
                      )}
                    </div>

                    <div className="group">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Role</label>
                      <div className="text-base font-medium text-slate-800 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-transparent group-hover:border-slate-200 transition-colors">
                        <Briefcase className="w-4 h-4 text-slate-400" />
                        <span className="capitalize">{getRoleLabel(user.role)}</span>
                      </div>
                    </div>

                    <div className="group">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Department</label>
                      <div className="text-base font-medium text-slate-800 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-transparent group-hover:border-slate-200 transition-colors">
                        <Building className="w-4 h-4 text-slate-400" />
                        <span>{user.department?.name || '—'}</span>
                      </div>
                    </div>

                    {employee?.address && (
                      <div className="md:col-span-2 group">
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Address (From Records)</label>
                        <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          {employee.address}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* EMPLOYMENT TAB */}
              {activeTab === 'employment' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Employment Records
                    </h3>
                    {user.role === 'employee' && updateConfig?.enabled && (
                      <button
                        onClick={() => {
                          // Pre-fill requestedChanges with current values
                          const initialChanges: any = {};
                          updateConfig.requestableFields.forEach((fieldId: string) => {
                            const rawValue = getRawFieldValue(fieldId);
                            if (rawValue !== undefined) {
                              initialChanges[fieldId] = normalizeFieldValueForInput(fieldId, rawValue);
                            }
                          });
                          if (updateConfig.allowQualifications && employee?.blood_group) {
                            // Qualifications handles specially
                          }
                          setRequestedChanges(initialChanges);
                          setShowRequestModal(true);
                        }}
                        className="text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-lg transition-colors border border-emerald-100 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Request Update
                      </button>
                    )}
                  </div>

                  {employee ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Employee ID</label>
                        <p className="text-lg font-bold text-slate-900 font-mono tracking-tight">{employee.emp_no}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Designation</label>
                        <p className="text-base font-medium text-slate-800">{employee.designation?.name || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Department</label>
                        <p className="text-base font-medium text-slate-800">{employee.department?.name || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Division</label>
                        <p className="text-base font-medium text-slate-800">{employee.division?.name || '—'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date of Joining</label>
                        <p className="text-base font-medium text-slate-800 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {/* Try multiple potential field names for joining date */}
                          {(employee.joining_date || (employee as any).date_of_joining || (employee as any).joiningDate || (employee as any).doj)
                            ? formatDate(employee.joining_date || (employee as any).date_of_joining || (employee as any).joiningDate || (employee as any).doj, false)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Shift</label>
                        <p className="text-base font-medium text-slate-800 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          {employee.shiftId ? `${employee.shiftId.name} (${employee.shiftId.startTime} - ${employee.shiftId.endTime})` : 'General'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reporting Manager</label>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                            {employee.reporting_manager?.employee_name?.[0] || 'M'}
                          </div>
                          <span className="text-base font-medium text-slate-800">{employee.reporting_manager?.employee_name || '—'}</span>
                        </div>
                      </div>
                      {/* Requestable Fields Display Area */}
                      {user.role === 'employee' && updateConfig?.enabled && (
                        <div className="md:col-span-2 pt-8 mt-8 border-t border-slate-100">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Requestable Profile Details</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            {updateConfig.requestableFields.map((fieldId: string, idx: number) => {
                              // Find field label from formGroups
                              let label = fieldId;
                              formGroups.forEach(g => {
                                const f = g.fields.find((f: any) => f.id === fieldId);
                                if (f) label = f.label;
                              });

                              const value = getRawFieldValue(fieldId);

                              return (
                                <div key={`${fieldId}-${idx}`} className="group">
                                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</label>
                                  <div className="text-base font-medium text-slate-800 flex items-center justify-between group-hover:bg-slate-50 p-2 rounded-lg transition-colors">
                                    <span>{formatFieldValue(value)}</span>
                                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-tight bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 opacity-0 group-hover:opacity-100 transition-opacity">Editable</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                      <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No employee record linked to this account.</p>
                      <p className="text-xs text-slate-400 mt-1">Please contact HR to link your employee profile.</p>
                    </div>
                  )}
                </div>
              )}

              {/* SECURITY TAB */}
              {activeTab === 'security' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-in fade-in zoom-in-95 duration-300">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-2">
                    Security & Password
                  </h3>
                  <p className="text-slate-500 text-sm mb-8">Manage your password and security settings periodically for safety.</p>

                  <form onSubmit={handlePasswordChange} className="max-w-lg space-y-5">
                    {passwordError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                        <Check className="w-4 h-4 flex-shrink-0" />
                        {passwordSuccess}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Password</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                          placeholder="••••••••"
                        />
                        <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                          placeholder="At least 4 characters"
                        />
                        <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                          placeholder="Re-enter new password"
                        />
                        <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={passwordLoading}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 rounded-lg shadow-lg shadow-slate-900/10 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                      >
                        {passwordLoading ? 'Updating...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>

      {/* Request Update Modal */}
      {
        showRequestModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Request Profile Update</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Your request will be sent to the administrator for approval.</p>
                </div>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Requestable Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {formGroups.map((group, groupIdx) => {
                    const allowedFieldsInGroup = group.fields.filter((f: any) => updateConfig?.requestableFields?.includes(f.id));
                    if (allowedFieldsInGroup.length === 0) return null;

                    return (
                      <div key={group._id || `group-${groupIdx}`} className="md:col-span-2 space-y-4">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">{group.name}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {allowedFieldsInGroup.map((field: any, fieldIdx: number) => (
                            <div key={field.id || `field-${fieldIdx}`} className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">{field.label}</label>
                              {field.type === 'select' || field.type === 'dropdown' ? (
                                (() => {
                                  const fieldOptions = getFieldOptionsForRequest(field);
                                  return (
                                <select
                                  value={requestedChanges[field.id] ?? ''}
                                  onChange={(e) => setRequestedChanges({ ...requestedChanges, [field.id]: e.target.value })}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                >
                                  <option value="">Select Option</option>
                                  {requestedChanges[field.id] &&
                                    !fieldOptions?.some((opt: any) => String(opt?.value) === String(requestedChanges[field.id])) && (
                                      <option value={requestedChanges[field.id]}>{requestedChanges[field.id]}</option>
                                    )}
                                  {fieldOptions?.map((opt: any, optIdx: number) => (
                                    <option key={`${opt.value}-${optIdx}`} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                  );
                                })()
                              ) : (
                                <input
                                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                                  value={requestedChanges[field.id] ?? ''}
                                  onChange={(e) => setRequestedChanges({ ...requestedChanges, [field.id]: e.target.value })}
                                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                  placeholder={`Enter ${field.label}...`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {(() => {
                    const renderedIds = new Set(
                      formGroups.flatMap((g: any) =>
                        (g.fields || [])
                          .filter((f: any) => updateConfig?.requestableFields?.includes(f.id))
                          .map((f: any) => f.id)
                      )
                    );
                    const missingFieldIds = (updateConfig?.requestableFields || []).filter((id: string) => !renderedIds.has(id));
                    if (missingFieldIds.length === 0) return null;

                    return (
                      <div className="md:col-span-2 space-y-4">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Other Requestable Fields</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {missingFieldIds.map((fieldId: string, idx: number) => (
                            <div key={`${fieldId}-${idx}`} className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">{fieldId.replace(/_/g, ' ')}</label>
                              <input
                                type={fieldId.toLowerCase().includes('date') || fieldId === 'dob' || fieldId === 'doj' ? 'date' : 'text'}
                                value={requestedChanges[fieldId] ?? ''}
                                onChange={(e) => setRequestedChanges({ ...requestedChanges, [fieldId]: e.target.value })}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                placeholder={`Enter ${fieldId.replace(/_/g, ' ')}...`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Qualifications Section */}
                  {updateConfig?.allowQualifications && (
                    <div className="md:col-span-2 space-y-4">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Qualifications</h4>
                      <p className="text-xs text-slate-500 italic">Please describe the education or certification changes you wish to request.</p>
                      <textarea
                        value={requestedChanges.qualifications || ''}
                        onChange={(e) => setRequestedChanges({ ...requestedChanges, qualifications: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[100px]"
                        placeholder="e.g. Added MBA degree from XYZ University, 2024..."
                      />
                    </div>
                  )}
                </div>

                {/* General Comments */}
                <div className="pt-6 border-t border-slate-100">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-tight mb-2 block">Reason / Additional Comments</label>
                  <textarea
                    value={requestComments}
                    onChange={(e) => setRequestComments(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[80px]"
                    placeholder="Explain why you are requesting these changes..."
                  />
                </div>
              </div>

              <div className="px-8 py-6 bg-slate-50 flex items-center justify-between">
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2 hover:bg-slate-200 rounded-lg transition-colors"
                  disabled={submittingRequest}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitUpdateRequest}
                  disabled={submittingRequest || Object.keys(requestedChanges).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-8 rounded-xl text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                >
                  {submittingRequest ? <Spinner className="w-4 h-4 !text-white" /> : <Mail className="w-4 h-4" />}
                  {submittingRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}




