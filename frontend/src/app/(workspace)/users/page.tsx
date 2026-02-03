'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Department, Division } from '@/lib/api';
import { auth } from '@/lib/auth';
import {
  canCreateUser,
  canEditUser,
  canDeleteUser,
  canResetPassword
} from '@/lib/permissions';
import { MODULE_CATEGORIES } from '@/config/moduleCategories';
import Spinner from '@/components/Spinner';

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const KeyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

interface User {
  _id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  department?: { _id: string; name: string; code?: string };
  departments?: { _id: string; name: string; code?: string }[];
  allowedDivisions?: { _id: string; name: string }[] | string[];
  divisionMapping?: { division: string | { _id: string; name: string }; departments: string[] | { _id: string; name: string }[] }[];
  employeeId?: string;
  employeeRef?: { emp_no: string; employee_name: string };
  isActive: boolean;
  departmentType?: 'single' | 'multiple';
  lastLogin?: string;
  createdAt: string;
  featureControl?: string[];
}

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  email?: string;
  phone_number?: string;
  department_id?: { _id: string; name: string; code?: string };
  designation_id?: { _id: string; name: string };
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  byRole: Record<string, number>;
}

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'sub_admin', label: 'Sub Admin', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'hr', label: 'HR', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'hod', label: 'HOD', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
];

const getRoleColor = (role: string) => {
  return ROLES.find((r) => r.value === role)?.color || 'bg-slate-100 text-slate-700';
};

const getRoleLabel = (role: string) => {
  return ROLES.find((r) => r.value === role)?.label || role;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [employeesWithoutAccount, setEmployeesWithoutAccount] = useState<Employee[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFromEmployeeDialog, setShowFromEmployeeDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Form state for create/edit
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'employee',
    departmentType: 'single' as 'single' | 'multiple',
    department: '',
    departments: [] as string[],
    allowedDivisions: [] as string[],
    password: '',
    autoGeneratePassword: true,
    featureControl: [] as string[],
  });

  // Form state for create from employee
  const [employeeFormData, setEmployeeFormData] = useState({
    employeeId: '',
    email: '',
    role: 'employee',
    departmentType: 'single' as 'single' | 'multiple',
    departments: [] as string[],
    autoGeneratePassword: true,
    featureControl: [] as string[],
  });

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalData, setSuccessModalData] = useState({
    username: '',
    password: '',
    message: ''
  });

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, deptRes, divRes, statsRes] = await Promise.all([
        api.getUsers({
          role: roleFilter || undefined,
          isActive: statusFilter ? statusFilter === 'active' : undefined,
          search: search || undefined,
        }),
        api.getDepartments(true),
        api.getDivisions(),
        api.getUserStats(),
      ]);

      if (usersRes.success) setUsers(usersRes.data || []);
      if (deptRes.success) setDepartments(deptRes.data || []);
      if (divRes.success) setDivisions(divRes.data || []);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, search]);

  const loadEmployeesWithoutAccount = async () => {
    try {
      const res = await api.getEmployeesWithoutAccount();
      if (res.success) {
        setEmployeesWithoutAccount(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clear messages
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Load default feature controls when role changes (not on every formData change)
  const previousRoleRef = useRef<string>('');

  useEffect(() => {
    const loadRoleDefaults = async () => {
      // Only load if role actually changed (not just formData update)
      if (!formData.role || formData.role === previousRoleRef.current) return;

      previousRoleRef.current = formData.role;

      try {
        const settingKey = `feature_control_${formData.role === 'hod' ? 'hod' : formData.role === 'hr' ? 'hr' : 'employee'}`;
        const res = await api.getSetting(settingKey);

        if (res.success && res.data?.value?.activeModules) {
          setFormData(prev => ({
            ...prev,
            featureControl: res.data?.value?.activeModules || []
          }));
        }
      } catch (err) {
        console.error('Failed to load role defaults:', err);
      }
    };

    loadRoleDefaults();
  }, [formData.role]);

  // Handle create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const payload: any = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        autoGeneratePassword: formData.autoGeneratePassword,
        assignWorkspace: true,
      };

      if (!formData.autoGeneratePassword && formData.password) {
        payload.password = formData.password;
      }

      // Handle department assignment based on departmentType
      if (formData.departmentType === 'single') {
        payload.department = formData.department || null;
      } else {
        payload.departments = formData.departments || [];
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;

      // Add allowedDivisions (for Manager)
      if (formData.role === 'manager') {
        payload.allowedDivisions = formData.allowedDivisions;
      }

      const res = await api.createUser(payload);

      if (res.success) {
        setSuccessModalData({
          username: res.data.user.email || formData.email,
          password: res.data.user.generatedPassword || formData.password,
          message: 'User created successfully. Please copy the credentials below.'
        });
        setShowSuccessModal(true);
        setShowCreateDialog(false);
        resetForm();
        loadData();
      } else {
        setError(res.message || res.error || 'Failed to create user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    }
  };

  // Handle create from employee
  const handleCreateFromEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const payload: any = {
        employeeId: employeeFormData.employeeId,
        role: employeeFormData.role,
        autoGeneratePassword: employeeFormData.autoGeneratePassword,
      };

      if (employeeFormData.email) {
        payload.email = employeeFormData.email;
      }

      // Handle department assignment based on departmentType
      if (employeeFormData.departmentType === 'single') {
        if (employeeFormData.departments[0]) {
          payload.department = employeeFormData.departments[0];
        }
      } else {
        payload.departments = employeeFormData.departments || [];
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = employeeFormData.featureControl;

      const res = await api.createUserFromEmployee(payload);

      if (res.success) {
        setSuccessModalData({
          username: res.data.email || res.data.identifier,
          password: res.data.generatedPassword || '',
          message: 'User created from employee successfully. Please copy the credentials below.'
        });
        setShowSuccessModal(true);
        setShowFromEmployeeDialog(false);
        resetEmployeeForm();
        loadData();
      } else {
        setError(res.message || res.error || 'Failed to create user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    }
  };

  // Handle update user
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError('');

    try {
      const payload: any = {
        name: formData.name,
        role: formData.role,
      };

      // Handle department assignment based on departmentType
      if (formData.departmentType === 'single') {
        payload.department = formData.department || null;
      } else {
        payload.departments = formData.departments || [];
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;

      // Add allowedDivisions (for Manager)
      if (formData.role === 'manager') {
        payload.allowedDivisions = formData.allowedDivisions;
      }

      const res = await api.updateUser(selectedUser._id, payload);

      if (res.success) {
        setSuccess('User updated successfully');
        setShowEditDialog(false);
        setSelectedUser(null);
        loadData();
      } else {
        setError(res.message || res.error || 'Failed to update user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    }
  };

  // Handle reset password
  const handleResetPassword = async (autoGenerate: boolean) => {
    if (!selectedUser) return;
    setError('');

    try {
      const res = await api.resetUserPassword(selectedUser._id, { autoGenerate });

      if (res.success) {
        setSuccess('Password reset successfully');
        if (res.data?.newPassword) {
          setGeneratedPassword(res.data.newPassword);
        }
        setShowPasswordDialog(false);
        setSelectedUser(null);
      } else {
        setError(res.message || 'Failed to reset password');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (user: User) => {
    try {
      const res = await api.toggleUserStatus(user._id);
      if (res.success) {
        setSuccess(`User ${res.data?.isActive ? 'activated' : 'deactivated'} successfully`);
        loadData();
      } else {
        setError(res.message || 'Failed to update status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  // Handle delete
  const handleDelete = async (user: User) => {
    if (!confirm(`Are you sure you want to delete user "${user.name}"?`)) return;

    try {
      const res = await api.deleteUser(user._id);
      if (res.success) {
        setSuccess('User deleted successfully');
        loadData();
      } else {
        setError(res.message || 'Failed to delete user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      departmentType: user.departmentType || (user.departments && user.departments.length > 1 ? 'multiple' : 'single'),
      department: user.department?._id || '',
      departments: user.departments?.map((d) => d._id) || [],
      allowedDivisions: user.allowedDivisions?.map((d: any) => typeof d === 'string' ? d : d._id) || [],
      password: '',
      autoGeneratePassword: false,
      featureControl: user.featureControl || [],
    });
    // Prevent useEffect from reloading defaults and overwriting user data
    previousRoleRef.current = user.role;
    setShowEditDialog(true);
  };

  // Open from employee dialog
  const openFromEmployeeDialog = () => {
    loadEmployeesWithoutAccount();
    setShowFromEmployeeDialog(true);
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
  };

  // Reset forms
  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      role: 'employee',
      departmentType: 'single',
      department: '',
      departments: [],
      allowedDivisions: [], // Initialize allowedDivisions
      password: '',
      autoGeneratePassword: true,
      featureControl: [],
    });
    previousRoleRef.current = '';
  };

  const resetEmployeeForm = () => {
    setEmployeeFormData({
      employeeId: '',
      email: '',
      role: 'employee',
      departmentType: 'single',
      departments: [],
      autoGeneratePassword: true,
      featureControl: [],
    });
    previousRoleRef.current = '';
  };

  // Handle department multi-select for HR
  const toggleDepartment = (deptId: string, isEmployee = false) => {
    if (isEmployee) {
      setEmployeeFormData((prev) => ({
        ...prev,
        departments: prev.departments.includes(deptId)
          ? prev.departments.filter((d) => d !== deptId)
          : [...prev.departments, deptId],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        departments: prev.departments.includes(deptId)
          ? prev.departments.filter((d) => d !== deptId)
          : [...prev.departments, deptId],
      }));
    }
  };

  // Permission checks
  const user = auth.getUser();
  const hasCreatePermission = user ? canCreateUser(user as any) : false;
  const hasEditPermission = user ? canEditUser(user as any) : false;
  const hasDeletePermission = user ? canDeleteUser(user as any) : false;
  const hasResetPasswordPermission = user ? canResetPassword(user as any) : false;

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manage system users, roles, and permissions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RefreshIcon />
              Refresh
            </button>
            {hasCreatePermission && (
              <button
                onClick={openFromEmployeeDialog}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
              >
                <UserIcon />
                Update User
              </button>
            )}
            {hasCreatePermission && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl"
              >
                <PlusIcon />
                Create User
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          {success}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
            <div className="text-3xl font-bold text-slate-900 dark:text-white">{stats.totalUsers}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Users</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
            <div className="text-3xl font-bold text-green-600">{stats.activeUsers}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Active</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
            <div className="text-3xl font-bold text-red-600">{stats.inactiveUsers}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Inactive</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
            <div className="text-3xl font-bold text-purple-600">{stats.byRole?.hod || 0}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">HODs</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/80">
            <div className="text-3xl font-bold text-green-600">{stats.byRole?.hr || 0}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">HRs</div>
          </div>
        </div>
      )}

      {/* Password Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSuccessModal(false)} />
          <div className="relative z-[110] w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Success!</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {successModalData.message}
              </p>
            </div>

            <div className="space-y-4 rounded-2xl bg-slate-50 p-6 dark:bg-slate-800/50">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Username / Email</label>
                <div className="mt-1 flex items-center justify-between gap-2 overflow-hidden">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{successModalData.username}</span>
                  <button
                    onClick={() => copyToClipboard(successModalData.username)}
                    className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
              <div className="h-px bg-slate-200 dark:bg-slate-700" />
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
                <div className="mt-1 flex items-center justify-between gap-2 overflow-hidden">
                  <span className="truncate font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{successModalData.password}</span>
                  <button
                    onClick={() => copyToClipboard(successModalData.password)}
                    className="flex-shrink-0 rounded-lg p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <p className="text-center text-[10px] text-slate-400">
                Credentials have also been sent via SMS/Email if configured.
              </p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white transition-all hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name, email, or employee ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All Roles</option>
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Employee ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {users.map((user) => (
                <tr key={user._id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                        {user.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{user.name}</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-lg ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.departments && user.departments.length > 1 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.departments.slice(0, 2).map((dept) => (
                          <span key={dept._id} className="inline-flex px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded dark:bg-slate-700 dark:text-slate-300">
                            {dept.name}
                          </span>
                        ))}
                        {user.departments.length > 2 && (
                          <span className="text-xs text-slate-500">+{user.departments.length - 2} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-600 dark:text-slate-300">
                        {user.department?.name || '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {user.employeeId || user.employeeRef?.emp_no || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {hasEditPermission ? (
                      <button
                        onClick={() => handleToggleStatus(user)}
                        disabled={user.role === 'super_admin'}
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-lg ${user.isActive
                          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                          } ${user.role === 'super_admin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    ) : (
                      <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-lg ${user.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {hasEditPermission && (
                        <button
                          onClick={() => openEditDialog(user)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:bg-slate-700"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                      )}
                      {hasResetPasswordPermission && (
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordDialog(true);
                          }}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg dark:text-amber-400 dark:hover:bg-amber-900/30"
                          title="Reset Password"
                        >
                          <KeyIcon />
                        </button>
                      )}
                      {hasDeletePermission && user.role !== 'super_admin' && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg dark:text-red-400 dark:hover:bg-red-900/30"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">No users found</p>
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      {
        showCreateDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreateDialog(false)} />
            <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Create New User</h2>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setFormData({
                        ...formData,
                        role,
                        department: '',
                        departments: [],
                        departmentType: ['hr'].includes(role) ? 'multiple' : 'single'
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {ROLES.filter((r) => r.value !== 'super_admin').map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>



                {formData.departmentType === 'multiple' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Departments <span className="text-xs text-slate-500">(User can manage multiple departments)</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                      {departments.map((dept) => (
                        <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.departments.includes(dept._id)}
                            onChange={() => toggleDepartment(dept._id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Department <span className="text-xs text-slate-500">(User is assigned to one department)</span>
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Manager Division Selection */}
                {formData.role === 'manager' && (
                  <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Assigned Division *
                      </label>
                      <select
                        value={formData.allowedDivisions && formData.allowedDivisions[0] ? formData.allowedDivisions[0] : ''}
                        onChange={(e) => {
                          const divId = e.target.value;
                          setFormData({
                            ...formData,
                            allowedDivisions: divId ? [divId] : [],
                            // Clear departments when division changes to prevent invalid selections
                            departments: []
                          });
                        }}
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Division</option>
                        {divisions.filter(d => d.isActive).map((div) => (
                          <option key={div._id} value={div._id}>
                            {div.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Departments in Selected Division */}
                    {formData.allowedDivisions && formData.allowedDivisions.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Allowed Departments
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, departments: [] })}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            title="Clear selection to allow access to ALL departments in this division"
                          >
                            Select All (Clear Restrictions)
                          </button>
                        </div>

                        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2 bg-slate-50 dark:bg-slate-800/50">
                          {departments
                            .filter(dept =>
                              dept.divisions?.some((div: any) => {
                                const divId = typeof div === 'string' ? div : div._id;
                                return divId === formData.allowedDivisions![0];
                              })
                            )
                            .map((dept) => (
                              <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.departments.includes(dept._id)}
                                  onChange={() => toggleDepartment(dept._id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                              </label>
                            ))}
                          {departments.filter(dept =>
                            dept.divisions?.some((div: any) => {
                              const divId = typeof div === 'string' ? div : div._id;
                              return divId === formData.allowedDivisions![0];
                            })
                          ).length === 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 p-2">No departments found in this division</p>
                            )}
                        </div>
                        {formData.departments.length === 0 && (
                          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                            ✓ All departments in this division will be accessible
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Feature Control */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Feature Access <span className="text-xs text-slate-500">(Override role defaults)</span>
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                    {MODULE_CATEGORIES.map((category) => (
                      <div key={category.code}>
                        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
                          {category.icon} {category.name}
                        </h4>
                        <div className="space-y-1">
                          {category.modules.map((module) => {
                            const hasLegacy = (formData.featureControl || []).includes(module.code);
                            const hasRead = hasLegacy || (formData.featureControl || []).includes(`${module.code}:read`) || (formData.featureControl || []).includes(`${module.code}:write`);
                            const hasWrite = hasLegacy || (formData.featureControl || []).includes(`${module.code}:write`);

                            return (
                              <div key={module.code} className="flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition-all hover:border-blue-100 hover:bg-white dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{module.label}</span>
                                </div>
                                <div className="flex items-center gap-3 px-1">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasRead}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(formData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:read`);

                                        // If legacy or write exists, we need to explicitly keep write
                                        if (hasLegacy || hasWrite) {
                                          if (!current.includes(`${module.code}:write`)) current.push(`${module.code}:write`);
                                        }

                                        if (isChecked) current.push(`${module.code}:read`);

                                        setFormData({ ...formData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">View</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasWrite}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(formData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:write`);

                                        // If legacy or read exists, explicitly keep read
                                        if (hasLegacy || hasRead) {
                                          if (!current.includes(`${module.code}:read`)) current.push(`${module.code}:read`);
                                        }

                                        if (isChecked) current.push(`${module.code}:write`);

                                        setFormData({ ...formData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">Manage</span>
                                  </label>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Password Options */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.autoGeneratePassword}
                      onChange={(e) => setFormData({ ...formData, autoGeneratePassword: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Auto-generate password</span>
                  </label>

                  {!formData.autoGeneratePassword && (
                    <div className="mt-3">
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required={!formData.autoGeneratePassword}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        placeholder="Enter password"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateDialog(false);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl hover:from-blue-600 hover:to-indigo-600"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div >
        )
      }

      {/* Update User Dialog */}
      {
        showFromEmployeeDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowFromEmployeeDialog(false)} />
            <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Update User from Employee</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Select an employee to create or update their user account
              </p>

              <form onSubmit={handleCreateFromEmployee} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Select Employee *
                  </label>
                  <select
                    value={employeeFormData.employeeId}
                    onChange={(e) => {
                      const emp = employeesWithoutAccount.find((emp) => emp.emp_no === e.target.value);
                      setEmployeeFormData({
                        ...employeeFormData,
                        employeeId: e.target.value,
                        email: emp?.email || '',
                      });
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Select Employee</option>
                    {employeesWithoutAccount.map((emp) => (
                      <option key={emp._id} value={emp.emp_no}>
                        {emp.emp_no} - {emp.employee_name} {emp.department_id?.name ? `(${emp.department_id.name})` : ''}
                      </option>
                    ))}
                  </select>
                  {employeesWithoutAccount.length === 0 && (
                    <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                      All employees already have user accounts
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Email <span className="text-xs text-slate-500">(Leave empty to use employee email)</span>
                  </label>
                  <input
                    type="email"
                    value={employeeFormData.email}
                    onChange={(e) => setEmployeeFormData({ ...employeeFormData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Role *</label>
                  <select
                    value={employeeFormData.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setEmployeeFormData({
                        ...employeeFormData,
                        role,
                        departments: [],
                        departmentType: ['hr'].includes(role) ? 'multiple' : 'single'
                      });
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {ROLES.filter((r) => r.value !== 'super_admin').map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>



                {employeeFormData.departmentType === 'multiple' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Departments to Manage
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                      {departments.map((dept) => (
                        <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={employeeFormData.departments.includes(dept._id)}
                            onChange={() => toggleDepartment(dept._id, true)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Department <span className="text-xs text-slate-500">(User is assigned to one department)</span>
                    </label>
                    <select
                      value={employeeFormData.departments[0] || ''}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, departments: e.target.value ? [e.target.value] : [] })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Feature Control */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Feature Access <span className="text-xs text-slate-500">(Override role defaults)</span>
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                    {MODULE_CATEGORIES.map((category) => (
                      <div key={category.code}>
                        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
                          {category.icon} {category.name}
                        </h4>
                        <div className="space-y-1">
                          {category.modules.map((module) => {
                            const hasLegacy = (employeeFormData.featureControl || []).includes(module.code);
                            const hasRead = hasLegacy || (employeeFormData.featureControl || []).includes(`${module.code}:read`) || (employeeFormData.featureControl || []).includes(`${module.code}:write`);
                            const hasWrite = hasLegacy || (employeeFormData.featureControl || []).includes(`${module.code}:write`);

                            return (
                              <div key={module.code} className="flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition-all hover:border-blue-100 hover:bg-white dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{module.label}</span>
                                </div>
                                <div className="flex items-center gap-3 px-1">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasRead}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(employeeFormData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:read`);

                                        // If legacy or write exists, we need to explicitly keep write
                                        if (hasLegacy || hasWrite) {
                                          if (!current.includes(`${module.code}:write`)) current.push(`${module.code}:write`);
                                        }

                                        if (isChecked) current.push(`${module.code}:read`);

                                        setEmployeeFormData({ ...employeeFormData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">View</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasWrite}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(employeeFormData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:write`);

                                        // If legacy or read exists, explicitly keep read
                                        if (hasLegacy || hasRead) {
                                          if (!current.includes(`${module.code}:read`)) current.push(`${module.code}:read`);
                                        }

                                        if (isChecked) current.push(`${module.code}:write`);

                                        setEmployeeFormData({ ...employeeFormData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">Manage</span>
                                  </label>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    * Password will be imported from employee record or generated automatically.
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFromEmployeeDialog(false);
                      resetEmployeeForm();
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!employeeFormData.employeeId}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-500 rounded-xl hover:from-green-600 hover:to-green-600 disabled:opacity-50"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Edit User Dialog */}
      {
        showEditDialog && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditDialog(false)} />
            <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Edit User</h2>

              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setFormData({
                        ...formData,
                        role,
                        departmentType: ['hr'].includes(role) ? 'multiple' : 'single'
                      });
                    }}
                    disabled={selectedUser.role === 'super_admin'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>



                {formData.departmentType === 'multiple' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Departments <span className="text-xs text-slate-500">(User can manage multiple departments)</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                      {departments.map((dept) => (
                        <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.departments.includes(dept._id)}
                            onChange={() => toggleDepartment(dept._id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Department <span className="text-xs text-slate-500">(User is assigned to one department)</span>
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Manager Division Selection */}
                {formData.role === 'manager' && (
                  <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Assigned Division *
                      </label>
                      <select
                        value={formData.allowedDivisions && formData.allowedDivisions[0] ? formData.allowedDivisions[0] : ''}
                        onChange={(e) => {
                          const divId = e.target.value;
                          setFormData({
                            ...formData,
                            allowedDivisions: divId ? [divId] : [],
                            // Clear departments when division changes to prevent invalid selections
                            departments: []
                          });
                        }}
                        required
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Select Division</option>
                        {divisions.filter(d => d.isActive).map((div) => (
                          <option key={div._id} value={div._id}>
                            {div.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Departments in Selected Division */}
                    {formData.allowedDivisions && formData.allowedDivisions.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Allowed Departments
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, departments: [] })}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            title="Clear selection to allow access to ALL departments in this division"
                          >
                            Select All (Clear Restrictions)
                          </button>
                        </div>

                        <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2 bg-slate-50 dark:bg-slate-800/50">
                          {departments
                            .filter(dept =>
                              dept.divisions?.some((div: any) => {
                                const divId = typeof div === 'string' ? div : div._id;
                                return divId === formData.allowedDivisions![0];
                              })
                            )
                            .map((dept) => (
                              <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.departments.includes(dept._id)}
                                  onChange={() => toggleDepartment(dept._id)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                              </label>
                            ))}
                          {departments.filter(dept =>
                            dept.divisions?.some((div: any) => {
                              const divId = typeof div === 'string' ? div : div._id;
                              return divId === formData.allowedDivisions![0];
                            })
                          ).length === 0 && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 p-2">No departments found in this division</p>
                            )}
                        </div>
                        {formData.departments.length === 0 && (
                          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                            ✓ All departments in this division will be accessible
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Feature Control */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Feature Access <span className="text-xs text-slate-500">(Override role defaults)</span>
                  </label>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                    {MODULE_CATEGORIES.map((category) => (
                      <div key={category.code}>
                        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
                          {category.icon} {category.name}
                        </h4>
                        <div className="space-y-1">
                          {category.modules.map((module) => {
                            const hasLegacy = (formData.featureControl || []).includes(module.code);
                            const hasRead = hasLegacy || (formData.featureControl || []).includes(`${module.code}:read`) || (formData.featureControl || []).includes(`${module.code}:write`);
                            const hasWrite = hasLegacy || (formData.featureControl || []).includes(`${module.code}:write`);

                            return (
                              <div key={module.code} className="flex flex-col gap-1.5 rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition-all hover:border-blue-100 hover:bg-white dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{module.label}</span>
                                </div>
                                <div className="flex items-center gap-3 px-1">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasRead}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(formData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:read`);

                                        // If legacy or write exists, we need to explicitly keep write
                                        if (hasLegacy || hasWrite) {
                                          if (!current.includes(`${module.code}:write`)) current.push(`${module.code}:write`);
                                        }

                                        if (isChecked) current.push(`${module.code}:read`);

                                        setFormData({ ...formData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">View</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={hasWrite}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        let current = [...(formData.featureControl || [])];

                                        // Remove legacy and this specific permission
                                        current = current.filter(c => c !== module.code && c !== `${module.code}:write`);

                                        // If legacy or read exists, explicitly keep read
                                        if (hasLegacy || hasRead) {
                                          if (!current.includes(`${module.code}:read`)) current.push(`${module.code}:read`);
                                        }

                                        if (isChecked) current.push(`${module.code}:write`);

                                        setFormData({ ...formData, featureControl: current });
                                      }}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">Manage</span>
                                  </label>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDialog(false);
                      setSelectedUser(null);
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl hover:from-blue-600 hover:to-indigo-600"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* Password Reset Dialog */}
      {
        showPasswordDialog && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPasswordDialog(false)} />
            <div className="relative z-50 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Reset Password</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Reset password for {selectedUser.name} ({selectedUser.email})
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => handleResetPassword(true)}
                  className="w-full px-4 py-3 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                >
                  Generate New Random Password
                </button>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setShowPasswordDialog(false);
                      setSelectedUser(null);
                    }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
