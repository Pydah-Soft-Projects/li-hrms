'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import Spinner from '@/components/Spinner';
import { User, Mail, Phone, Briefcase, Calendar, Shield, Key, Building, MapPin } from 'lucide-react';

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
    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
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
          <p className="text-slate-500 mt-1">View and manage your account and employment details</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left Column: Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-8">
              {/* Cover Gradient */}
              <div className="h-32 bg-gradient-to-br from-indigo-600 via-blue-600 to-emerald-500 relative">
                {/* Status Dot */}
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/20 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-medium">
                  <span className={`w-2 h-2 rounded-full ${user.isActive || user.is_active !== false ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-500'}`} />
                  {user.isActive || user.is_active !== false ? 'Active' : 'Inactive'}
                </div>
              </div>

              {/* Avatar & Basic Info */}
              <div className="px-6 pb-6 text-center -mt-16 relative">
                <div className="w-32 h-32 mx-auto rounded-full bg-white p-1.5 shadow-xl">
                  <div className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-4xl font-bold text-slate-400 border border-slate-200">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
                  <p className="text-slate-500 text-sm mt-1">{user.email}</p>
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                  {user.department && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                      {user.department.name}
                    </span>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4 text-left">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Joined</p>
                    <p className="text-sm font-medium text-slate-800">{formatDate(user.createdAt, false)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-1">Last Login</p>
                    <p className="text-sm font-medium text-slate-800">{user.lastLogin ? formatDate(user.lastLogin, true) : 'Never'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Information Tabs */}
          <div className="lg:col-span-8">
            {/* Tabs Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1 mb-6 flex overflow-x-auto hide-scrollbar">
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
                    {!isEditing ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors"
                      >
                        Edit Details
                      </button>
                    ) : (
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
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-8">
                    Employment Records
                  </h3>

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
                          placeholder="At least 6 characters"
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
    </div>
  );
}

// Simple icons for things not imported from Lucide (added inside component via Lucide imports where possible)
// But wait, I imported Lucide for everything.
// Need to import AlertTriangle, Check, Clock.
import { AlertTriangle, Check, Clock } from 'lucide-react';


