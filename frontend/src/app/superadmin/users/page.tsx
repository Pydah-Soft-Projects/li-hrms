/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Department, Division, User, Employee, DataScope } from '@/lib/api';
import { MODULE_CATEGORIES } from '@/config/moduleCategories';
import Spinner from '@/components/Spinner';
import {
  Plus,
  Search,
  Edit,
  Key,
  User as UserIcon,
  Trash2,
  RotateCw,
  Copy,
  CheckCircle,
  Users,
  UserCheck,
  UserX,
  Shield,
  Building,
  Eye,
  EyeOff,
  Filter,
  Check,
  ChevronRight,
  UserPlus,
  Mail,
  X,
  Layers,
  Globe,
  UserCircle,
  ShieldAlert,
  ShieldCheck,
  Info,
  RefreshCw,
  Lock
} from 'lucide-react';

// Custom Stat Card for User Management
const StatCard = ({ title, value, icon: Icon, bgClass, iconClass, dekorClass, trend }: { title: string, value: number | string, icon: any, bgClass: string, iconClass: string, dekorClass?: string, trend?: { value: string, positive: boolean } }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="text-3xl font-black text-slate-900 dark:text-white">{value}</h3>
          {trend && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${trend.positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
              {trend.value}
            </span>
          )}
        </div>
      </div>
      <div className={`flex h-14 w-14 items-center justify-center rounded-[1.25rem] ${bgClass} ${iconClass}`}>
        <Icon className="h-7 w-7" />
      </div>
    </div>
    {dekorClass && <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${dekorClass}`} />}
  </div>
);

interface UserFormData {
  email: string;
  name?: string;
  role: string;
  password?: string;
  autoGeneratePassword: boolean;
  departmentType?: 'single' | 'multiple';
  department?: string;
  departments?: string[];
  featureControl?: string[];
  dataScope?: DataScope | string;
  allowedDivisions?: (string | Division)[];
  divisionMapping?: { division: string | Division; departments: (string | Department)[] }[];
  division?: string;
  employeeId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  byRole: Record<string, number>;
}

const ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  { value: 'sub_admin', label: 'Sub Admin', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'hr', label: 'HR', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'manager', label: 'Manager', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  { value: 'hod', label: 'HOD', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { value: 'employee', label: 'Employee', color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400' },
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
  const [resetPasswordState, setResetPasswordState] = useState({
    newPassword: '',
    confirmPassword: '',
    showNew: false,
    showConfirm: false,
    autoGenerate: true
  });
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedViewUser, setSelectedViewUser] = useState<User | null>(null);

  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    role: 'super_admin',
    departmentType: 'single',
    department: '',
    departments: [],
    password: '',
    autoGeneratePassword: true,
    featureControl: [],
    dataScope: 'all',
    allowedDivisions: [],
    divisionMapping: [],
    division: '',
  });

  // Form state for create from employee
  const [employeeFormData, setEmployeeFormData] = useState<UserFormData>({
    employeeId: '',
    email: '',
    role: 'employee',
    departmentType: 'single',
    departments: [],
    autoGeneratePassword: true,
    featureControl: [],
    dataScope: 'all',
    allowedDivisions: [],
    divisionMapping: [],
    division: '',
  });

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
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
          const defaultScope = formData.role === 'manager' ? 'division' : (formData.role === 'hod' ? 'department' : 'all');
          setFormData(prev => ({
            ...prev,
            featureControl: res.data?.value?.activeModules || [],
            dataScope: defaultScope as DataScope
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
      const payload: Partial<User> & {
        autoGeneratePassword?: boolean;
        password?: string;
        assignWorkspace?: boolean;
        department?: string | null;
        dataScope?: DataScope | string;
        allowedDivisions?: string[];
        divisionMapping?: any[];
        featureControl?: string[];
        division?: string;
      } = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        autoGeneratePassword: formData.autoGeneratePassword,
        assignWorkspace: true,
        division: formData.division,
      };

      if (!formData.autoGeneratePassword && formData.password) {
        payload.password = formData.password;
      }

      // Handle scoping
      payload.dataScope = formData.dataScope as DataScope;
      if (formData.dataScope === 'department') {
        (payload as any).department = formData.department || null;
      } else if (formData.dataScope === 'division') {
        payload.allowedDivisions = (formData.allowedDivisions || []).map(d => typeof d === 'string' ? d : d._id);
        payload.divisionMapping = (formData.divisionMapping || []).map(m => ({
          division: typeof m.division === 'string' ? m.division : m.division._id,
          departments: (m.departments || []).map(d => typeof d === 'string' ? d : d._id)
        }));

        // Manager specific: Map selected departments to divisionMapping
        if (formData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
          const divId = payload.allowedDivisions[0];
          const depts = (formData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
          payload.divisionMapping = [{
            division: divId,
            departments: depts
          }];
        }
      }

      // Force HOD to use 'department' scope and include department field
      if (formData.role === 'hod') {
        payload.dataScope = 'department';
        (payload as any).department = formData.department || null;
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;

      const res = await api.createUser(payload as any);

      if (res.success) {
        setSuccessModalData({
          username: res.data.user.email || res.data.identifier,
          password: res.data.generatedPassword || formData.password,
          message: 'User created successfully. Please copy the credentials below.'
        });
        setShowSuccessModal(true);
        setShowCreateDialog(false);
        resetForm();
        loadData();
      } else {
        setError(res.message || res.error || 'Failed to create user');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  // Handle create from employee
  const handleCreateFromEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const payload: { employeeId: string; role: string; autoGeneratePassword: boolean; email?: string; dataScope?: DataScope | string; department?: string | null; allowedDivisions?: string[]; divisionMapping?: { division: string | Division; departments: (string | Department)[] }[]; featureControl?: string[] } = {
        employeeId: employeeFormData.employeeId || '',
        role: employeeFormData.role,
        autoGeneratePassword: employeeFormData.autoGeneratePassword,
      };

      if (employeeFormData.email) {
        payload.email = employeeFormData.email;
      }

      // Handle scoping
      payload.dataScope = employeeFormData.dataScope || 'all';
      if (payload.dataScope === 'department') {
        payload.department = (employeeFormData.departments || [])[0] || null;
      } else if (payload.dataScope === 'division') {
        payload.allowedDivisions = (employeeFormData.allowedDivisions || []).map(d => typeof d === 'string' ? d : d._id);
        payload.divisionMapping = (employeeFormData.divisionMapping || []).map(m => ({
          division: typeof m.division === 'string' ? m.division : m.division._id,
          departments: (m.departments || []).map(d => typeof d === 'string' ? d : d._id)
        }));

        // Manager specific: Map selected departments to divisionMapping
        if (employeeFormData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
          const divId = payload.allowedDivisions[0];
          const depts = (employeeFormData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
          payload.divisionMapping = [{
            division: divId,
            departments: depts
          }];
        }
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

      // Handle scoping
      payload.dataScope = formData.dataScope;
      if (formData.dataScope === 'department') {
        (payload as any).department = formData.department || null;
      } else if (formData.dataScope === 'division') {
        payload.allowedDivisions = formData.allowedDivisions;
        payload.divisionMapping = formData.divisionMapping;

        // Manager specific: Map selected departments to divisionMapping
        if (formData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
          const divId = typeof payload.allowedDivisions[0] === 'string' ? payload.allowedDivisions[0] : payload.allowedDivisions[0]._id;
          const depts = (formData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
          payload.divisionMapping = [{
            division: divId,
            departments: depts
          }];
        }
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;

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
  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setError('');

    if (!resetPasswordState.autoGenerate) {
      if (resetPasswordState.newPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (resetPasswordState.newPassword !== resetPasswordState.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    try {
      const res = await api.resetUserPassword(selectedUser._id, {
        autoGenerate: resetPasswordState.autoGenerate,
        newPassword: resetPasswordState.autoGenerate ? undefined : resetPasswordState.newPassword
      });

      if (res.success) {
        setSuccess(res.message || 'Password reset successfully');
        if (res.newPassword) {
          setSuccessModalData({
            username: selectedUser.email,
            password: res.newPassword,
            message: 'Password has been reset successfully.'
          });
          setShowSuccessModal(true);
        }
        setShowPasswordDialog(false);
        setSelectedUser(null);
        setResetPasswordState({
          newPassword: '',
          confirmPassword: '',
          showNew: false,
          showConfirm: false,
          autoGenerate: true
        });
      } else {
        setError(res.message || 'Failed to reset password');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (!password) return { label: 'None', score: 0, color: 'bg-slate-200' };

    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const ratings = [
      { label: 'Poor', score: 1, color: 'bg-red-500' },
      { label: 'Weak', score: 2, color: 'bg-orange-500' },
      { label: 'Good', score: 3, color: 'bg-yellow-500' },
      { label: 'Strong', score: 4, color: 'bg-green-500' }
    ];

    return ratings.find(r => r.score >= score) || ratings[0];
  };

  // Handle toggle status
  const handleToggleStatus = async (user: User) => {
    try {
      const res = await api.toggleUserStatus(user._id);
      if (res.success) {
        const isNowActive = res.data?.isActive ?? !user.isActive;
        const syncMessage = res.syncError ? ' (MSSQL sync failed, but local update succeeded)' : '';
        setSuccess(`User ${isNowActive ? 'activated' : 'deactivated'} successfully${syncMessage}`);
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

    // Normalize divisionMapping to IDs
    const normalizedMapping = (user.divisionMapping || []).map(m => ({
      division: typeof m.division === 'string' ? m.division : m.division?._id,
      departments: (m.departments || []).map((d: any) => typeof d === 'string' ? d : d?._id)
    }));

    // For HOD/Manager, prioritize the managed division and departments from division mapping
    const mapping = normalizedMapping.length > 0 ? normalizedMapping[0] : null;

    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      departmentType: user.departmentType || (user.departments && user.departments.length > 1 ? 'multiple' : 'single'),
      department: user.role === 'hod' && mapping && mapping.departments?.length > 0 ? mapping.departments[0] : (user.department?._id || ''),
      departments: user.role === 'manager' && mapping ? mapping.departments : (user.departments?.map((d) => d._id) || []),
      password: '',
      autoGeneratePassword: false,
      featureControl: user.featureControl || [],
      dataScope: user.dataScope || 'all',
      allowedDivisions: user.allowedDivisions?.map(d => typeof d === 'string' ? d : d?._id) || [],
      divisionMapping: normalizedMapping,
      division: (user.role === 'hod' || user.role === 'manager') && mapping ? mapping.division : '',
    });
    // Prevent useEffect from reloading defaults and overwriting user data
    previousRoleRef.current = user.role;
    setShowEditDialog(true);
  };

  // Open from employee dialog
  const openFromEmployeeDialog = () => {
    loadEmployeesWithoutAccount();
    setEmployeeSearch('');
    setShowEmployeeDropdown(false);
    setShowFromEmployeeDialog(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      role: 'super_admin',
      departmentType: 'single',
      department: '',
      departments: [],
      password: '',
      autoGeneratePassword: true,
      featureControl: [],
      dataScope: 'all',
      allowedDivisions: [],
      divisionMapping: [],
      division: '',
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
      dataScope: 'all',
      allowedDivisions: [],
      divisionMapping: [],
      division: '',
    });
    previousRoleRef.current = '';
  };



  const toggleDivisionMapping = (divisionId: string, deptId: string | null = null, isEmployee = false) => {
    const setFunc = isEmployee ? setEmployeeFormData : setFormData;

    setFunc((prev: any) => {
      let newMapping = [...(prev.divisionMapping || [])];
      let existingDivisionIdx = newMapping.findIndex(m => {
        const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
        return mDivId === divisionId;
      });

      if (deptId === null) {
        // Toggle Division Header
        if (existingDivisionIdx !== -1) {
          // If already has specific departments, clicking header makes it "All Departments"
          if (newMapping[existingDivisionIdx].departments.length > 0) {
            newMapping[existingDivisionIdx] = { ...newMapping[existingDivisionIdx], departments: [] };
          } else {
            // Was already "All Departments", so remove it entirely
            newMapping.splice(existingDivisionIdx, 1);
          }
        } else {
          // Not selected, add it as "All Departments"
          newMapping.push({ division: divisionId, departments: [] });
        }
      } else {
        // Toggle Specific Department
        if (existingDivisionIdx === -1) {
          newMapping.push({ division: divisionId, departments: [deptId] });
        } else {
          const currentDepts = [...newMapping[existingDivisionIdx].departments];
          if (currentDepts.includes(deptId)) {
            newMapping[existingDivisionIdx] = {
              ...newMapping[existingDivisionIdx],
              departments: currentDepts.filter(d => d !== deptId)
            };
          } else {
            newMapping[existingDivisionIdx] = {
              ...newMapping[existingDivisionIdx],
              departments: [...currentDepts, deptId]
            };
          }
        }
      }

      // If HOD, restrict to single choice
      if (prev.role === 'hod') {
        if (deptId !== null) {
          newMapping = [{ division: divisionId, departments: [deptId] }];
        } else {
          newMapping = [{ division: divisionId, departments: [] }];
        }
      }

      return {
        ...prev,
        divisionMapping: newMapping,
        allowedDivisions: newMapping.map(m => typeof m.division === 'string' ? m.division : m.division?._id)
      };
    });
  };

  const ScopingSelector = ({ data, setData, asEmployee = false }: { data: UserFormData, setData: React.Dispatch<React.SetStateAction<UserFormData>>, asEmployee?: boolean }) => {
    // Specialized UI for Manager Role (Single Division)
    if (data.role === 'manager') {
      const selectedDivisionId = data.division || (data.allowedDivisions?.[0]
        ? (typeof data.allowedDivisions[0] === 'string' ? data.allowedDivisions[0] : (data.allowedDivisions[0] as Division)._id)
        : '');

      const handleManagerDivisionChange = (divId: string) => {
        setData({
          ...data,
          division: divId,
          allowedDivisions: divId ? [divId] : [],
          divisionMapping: [], // Managers don't need department mapping usually, or implicit all
          department: '',
          departments: [],
          dataScope: 'division'
        });
      };

      return (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 dark:bg-blue-900/10 dark:border-blue-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-blue-800 dark:text-blue-400 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800/50">
                <Building className="h-4 w-4" />
              </span>
              Division Manager Assignment
            </h3>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Select Division *
              </label>
              <select
                value={selectedDivisionId}
                onChange={(e) => handleManagerDivisionChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Choose Division --</option>
                {divisions.map(d => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                This user will be assigned as the Manager for the selected Division.
              </p>
            </div>

            {/* Manager Department Selection */}
            {selectedDivisionId && (
              <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Allowed Departments
                  </label>
                  <button
                    type="button"
                    onClick={() => setData({ ...data, departments: [] })}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    title="Clear selection to allow access to ALL departments in this division"
                  >
                    Select All (Clear Restrictions)
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 space-y-2 bg-white/50 dark:bg-slate-800/50">
                  {departments
                    .filter(dept =>
                      dept.divisions?.some((div: any) => {
                        const dId = typeof div === 'string' ? div : div._id;
                        return dId === selectedDivisionId;
                      })
                    )
                    .map((dept) => (
                      <label key={dept._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-blue-100/50 dark:hover:bg-blue-900/30 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={data.departments?.includes(dept._id)}
                          onChange={() => {
                            const currentDepts = data.departments || [];
                            if (currentDepts.includes(dept._id)) {
                              setData({ ...data, departments: currentDepts.filter(d => d !== dept._id) });
                            } else {
                              setData({ ...data, departments: [...currentDepts, dept._id] });
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{dept.name}</span>
                      </label>
                    ))}
                  {departments.filter(dept =>
                    dept.divisions?.some((div: any) => {
                      const dId = typeof div === 'string' ? div : div._id;
                      return dId === selectedDivisionId;
                    })
                  ).length === 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 p-2">No departments found in this division</p>
                    )}
                </div>
                {(!data.departments || data.departments.length === 0) && (
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-medium">
                    ✓ Access granted to ALL departments in this division
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Specialized UI for HOD Role
    if (data.role === 'hod') {
      const selectedDivisionId = data.division || (data.divisionMapping?.[0]?.division
        ? (typeof data.divisionMapping[0].division === 'string'
          ? data.divisionMapping[0].division
          : data.divisionMapping[0].division._id)
        : '');

      const getDeptId = (dept: string | Department | undefined) => {
        if (!dept) return '';
        return typeof dept === 'string' ? dept : dept._id;
      };
      const selectedDepartmentId = data.department || getDeptId(data.divisionMapping?.[0]?.departments?.[0]) || '';

      const handleDivisionChange = (divId: string) => {
        const newMapping = divId ? [{ division: divId, departments: [] }] : [];
        setData({
          ...data,
          division: divId,
          department: '', // Reset department when division changes
          divisionMapping: newMapping,
          allowedDivisions: divId ? [divId] : [],
          dataScope: 'department' // Implicitly set datascope
        });
      };

      const handleDepartmentChange = (deptId: string) => {
        if (!selectedDivisionId) return;
        const newMapping = [{ division: selectedDivisionId, departments: deptId ? [deptId] : [] }];
        setData({
          ...data,
          department: deptId,
          divisionMapping: newMapping
        });
      };

      // Filter departments based on selected division
      // Check if department has the division ID in its divisions array (which can be objects or strings)
      const filteredDepartments = departments.filter(d =>
        d.divisions?.some((div: any) => {
          const dId = typeof div === 'string' ? div : div._id;
          return dId === selectedDivisionId;
        })
      );

      return (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 dark:bg-amber-900/10 dark:border-amber-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-400 mb-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800/50">
                <Users className="h-4 w-4" />
              </span>
              HOD Assignment
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Select Division *
                </label>
                <select
                  value={selectedDivisionId}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-amber-500 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">-- Choose Division --</option>
                  {divisions.map(d => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Select Department *
                </label>
                <select
                  value={selectedDepartmentId}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  disabled={!selectedDivisionId}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-amber-500 focus:ring-amber-500 disabled:opacity-50 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                >
                  <option value="">-- Choose Department --</option>
                  {filteredDepartments.map(d => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
                {selectedDivisionId && filteredDepartments.length === 0 && (
                  <p className="mt-1 text-xs text-red-500">No departments linked to this division.</p>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100/50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                This user will be assigned as the Head of Department for the selected Department within the selected Division.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Default Scoping UI for other roles
    return (
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Data Scope *</label>
          <select
            value={data.dataScope}
            onChange={(e) => setData({ ...data, dataScope: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Data (Across All Divisions)</option>
            <option value="division">Specific Divisions / Departments</option>
            {/* option value="department" removed for HOD as it's handled above, but kept if needed for others */}
            <option value="own">Self Only</option>
          </select>
        </div>

        {data.dataScope === 'division' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Division & Department Access Mapping
            </label>

            <div className="space-y-4">
              {divisions.map((div) => {
                const isSelected = data.divisionMapping?.some((m: any) => {
                  const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
                  return mDivId === div._id;
                });
                const mapping = data.divisionMapping?.find((m: any) => {
                  const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
                  return mDivId === div._id;
                });

                return (
                  <div key={div._id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`flex items-center justify-between p-3 cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      onClick={() => toggleDivisionMapping(div._id, null, asEmployee)}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span className="text-sm font-medium dark:text-white">{div.name}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                          {mapping?.departments.length === 0 ? 'All Departments' : `${mapping?.departments.length} Departments`}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <div className="p-3 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2">
                        {departments.filter(dept => dept.divisions?.some((d: any) => (typeof d === 'string' ? d : d._id) === div._id)).map(dept => (
                          <label key={dept._id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mapping?.departments.includes(dept._id)}
                              onChange={() => toggleDivisionMapping(div._id, dept._id, asEmployee)}
                              className="rounded border-slate-300 text-blue-600 scale-75"
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{dept.name}</span>
                          </label>
                        ))}
                        {departments.filter(dept => dept.divisions?.some((d: any) => (typeof d === 'string' ? d : d._id) === div._id)).length === 0 && (
                          <div className="col-span-2 text-center py-2 text-[10px] text-slate-400">No departments linked to this division</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.dataScope === 'department' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Select Department
            </label>
            <select
              value={data.department || ''}
              onChange={(e) => setData({ ...data, department: e.target.value })}
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
      </div>
    );
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 p-6 dark:bg-slate-950/50">
      {/* Background Decorations */}
      <div className="pointer-events-none absolute " />

      <div className="relative mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <Shield className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">System Control</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">User Management</h1>
            <p className="mt-1 text-base text-slate-500 dark:text-slate-400">
              Configure system access, manage roles, and monitor user activity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadData}
              className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <RotateCw className={`h-4 w-4 transition-transform group-hover:rotate-180 ${loading ? 'animate-spin' : ''}`} />
              Sync Data
            </button>
            <button
              onClick={openFromEmployeeDialog}
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400"
            >
              <UserPlus className="h-4 w-4" />
              Upgrade Employee
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-xl shadow-slate-900/20 transition-all hover:scale-[1.02] hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-slate-900 dark:shadow-none"
            >
              <Plus className="h-4 w-4" />
              New User
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
              <span className="text-xl">⚠️</span>
            </div>
            <p className="font-medium">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-700 dark:border-green-800/50 dark:bg-green-900/20 dark:text-green-400">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6" />
            </div>
            <p className="font-medium">{success}</p>
          </div>
        )}

        {/* Stats Grid */}
        {stats && (
          <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="Total Accounts"
              value={stats.totalUsers}
              icon={Users}
              bgClass="bg-blue-500/10"
              iconClass="text-blue-600 dark:text-blue-400"
            // dekorClass="bg-blue-500/5"
            />
            <StatCard
              title="Active Users"
              value={stats.activeUsers}
              icon={UserCheck}
              bgClass="bg-emerald-500/10"
              iconClass="text-emerald-600 dark:text-emerald-400"
              // dekorClass="bg-emerald-500/5"
              trend={{ value: "+12%", positive: true }}
            />
            <StatCard
              title="HODs"
              value={stats.byRole?.hod || 0}
              icon={Shield}
              bgClass="bg-violet-500/10"
              iconClass="text-violet-600 dark:text-violet-400"
            // dekorClass="bg-violet-500/5"
            />
            <StatCard
              title="Managers"
              value={stats.byRole?.manager || 0}
              icon={Building}
              bgClass="bg-sky-500/10"
              iconClass="text-sky-600 dark:text-sky-400"
            // dekorClass="bg-sky-500/5"
            />
            <StatCard
              title="Inactive"
              value={stats.inactiveUsers}
              icon={UserX}
              bgClass="bg-rose-500/10"
              iconClass="text-rose-600 dark:text-rose-400"
            // dekorClass="bg-rose-500/5"
            />
          </div>
        )}

        {/* Filters & Actions Bar */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users by name, email, or emp ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-600 focus:outline-none dark:text-slate-300"
              >
                <option value="">All Roles</option>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-600 focus:outline-none dark:text-slate-300"
              >
                <option value="">Any Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                  <th className="px-6 py-5 text-left text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    System User
                  </th>
                  <th className="px-6 py-5 text-left text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Role & Permissions
                  </th>
                  <th className="px-6 py-5 text-left text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Access Scope
                  </th>
                  <th className="px-6 py-5 text-left text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Identifier
                  </th>
                  <th className="px-6 py-5 text-left text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Account Status
                  </th>
                  <th className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((user) => (
                  <tr key={user._id} className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div
                          className="relative flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white shadow-lg shadow-blue-500/20 transition-transform group-hover:scale-110"
                          onClick={() => {
                            setSelectedViewUser(user);
                            setShowViewDialog(true);
                          }}
                        >
                          {user.name?.[0]?.toUpperCase() || '?'}
                          <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900 ${!user.isActive && 'bg-slate-400 hover:bg-slate-500'}`} />
                        </div>
                        <div className="min-w-0">
                          <button
                            onClick={() => {
                              setSelectedViewUser(user);
                              setShowViewDialog(true);
                            }}
                            className="block truncate text-sm font-bold text-slate-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                          >
                            {user.name}
                          </button>
                          <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-tight ${getRoleColor(user.role)}`}>
                        <Shield className="h-3 w-3" />
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5">
                        {user.departments && user.departments.length > 0 ? (
                          <>
                            {user.departments.slice(0, 1).map((dept) => (
                              <span key={dept._id} className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                <Building className="h-2.5 w-2.5" />
                                {dept.name}
                              </span>
                            ))}
                            {user.departments.length > 1 && (
                              <span className="rounded-md bg-blue-100/50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                +{user.departments.length - 1} more
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 italic">No dept assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <code className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {user.employeeId || user.employeeRef?.emp_no || 'SYSTEM'}
                      </code>
                    </td>
                    <td className="px-6 py-5">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        disabled={user.role === 'super_admin'}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition-all ${user.isActive
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400'
                          } ${user.role === 'super_admin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {user.isActive ? 'ACTIVE' : 'DISABLED'}
                      </button>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditDialog(user)}
                          className="rounded-xl border border-slate-100 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/10"
                          title="Edit Account"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordDialog(true);
                          }}
                          className="rounded-xl border border-slate-100 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-amber-200 hover:bg-amber-50 hover:text-amber-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10"
                          title="Reset Password"
                        >
                          <Key className="h-4 w-4" />
                        </button>
                        {user.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDelete(user)}
                            className="rounded-xl border border-slate-100 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10"
                            title="Delete User"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedViewUser(user);
                            setShowViewDialog(true);
                          }}
                          className="rounded-xl border border-slate-100 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10"
                          title="View Details"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800">
                <Users className="h-8 w-8 text-slate-400" />
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">No Users Found</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Try adjusting your filters or search query.</p>
            </div>
          )}
        </div>

        {/* Create User Dialog */}
        {
          showCreateDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreateDialog(false)} />
              <div className="relative z-50 flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create New User</h2>
                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Access Provisioning</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCreateDialog(false)}
                    className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                  <form onSubmit={handleCreateUser} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full Name *</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          placeholder="e.g. John Doe"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email Address *</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">System Role *</label>
                      <select
                        value={formData.role}
                        onChange={(e) => {
                          const role = e.target.value;
                          setFormData({
                            ...formData,
                            role,
                            dataScope: ['hr', 'sub_admin', 'super_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                            department: '',
                            departments: [],
                            divisionMapping: []
                          });
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        {ROLES.filter(r => r.value !== 'employee').map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
                      <ScopingSelector data={formData} setData={setFormData} />
                    </div>

                    {/* Feature Control */}
                    <div className="space-y-3">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Module Access Control</label>
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-700 dark:bg-slate-950/50">
                        {MODULE_CATEGORIES.map((category) => (
                          <div key={category.code}>
                            <h4 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                              {category.name}
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {category.modules.map((module) => (
                                <label key={module.code} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 transition-all hover:border-blue-100 hover:bg-white dark:border-slate-800 dark:bg-slate-900">
                                  <input
                                    type="checkbox"
                                    checked={(formData.featureControl || []).includes(module.code)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormData({ ...formData, featureControl: [...(formData.featureControl || []), module.code] });
                                      } else {
                                        setFormData({ ...formData, featureControl: (formData.featureControl || []).filter(m => m !== module.code) });
                                      }
                                    }}
                                    className="h-4 w-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    {module.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Password Configuration */}
                    <div className="space-y-4 rounded-2xl border border-blue-50 bg-blue-50/30 p-5 dark:border-blue-900/10 dark:bg-blue-900/5">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${formData.autoGeneratePassword ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white'}`}>
                          {formData.autoGeneratePassword && <Check className="h-3 w-3" />}
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={formData.autoGeneratePassword}
                            onChange={(e) => setFormData({ ...formData, autoGeneratePassword: e.target.checked })}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Sync with system password policies</span>
                      </label>

                      {!formData.autoGeneratePassword && (
                        <div className="relative mt-2">
                          <Key className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            placeholder="Create secure password"
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 pr-4 text-sm focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCreateDialog(false)}
                        className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400"
                      >
                        Discard
                      </button>
                      <button
                        type="submit"
                        className="flex-1 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.98]"
                      >
                        Create Account
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div >
          )
        }

        {/* Update User Dialog */}
        {showFromEmployeeDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                setShowFromEmployeeDialog(false);
                resetEmployeeForm();
              }}
            />
            <div className="relative z-50 flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
              {/* Tightened Header */}
              <div className="relative bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-6 text-white overflow-hidden">
                <button
                  onClick={() => setShowFromEmployeeDialog(false)}
                  className="absolute right-4 top-4 rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
                    <UserPlus className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black">Provision Employee</h2>
                    <p className="text-emerald-50 text-[10px] font-bold uppercase tracking-wider opacity-80">Access Management</p>
                  </div>
                </div>
              </div>

              {/* Fixed Scrollable Area */}
              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <form onSubmit={handleCreateFromEmployee} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Target Employee *</label>
                    <div className="relative" ref={employeeDropdownRef}>
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search by name or employee ID..."
                          value={employeeSearch}
                          onFocus={() => setShowEmployeeDropdown(true)}
                          onChange={(e) => {
                            setEmployeeSearch(e.target.value);
                            setShowEmployeeDropdown(true);
                            if (e.target.value === '') {
                              setEmployeeFormData({ ...employeeFormData, employeeId: '', email: '' });
                            }
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-12 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                        >
                          <ChevronRight className={`h-4 w-4 transition-transform ${showEmployeeDropdown ? 'rotate-90' : ''}`} />
                        </button>
                      </div>

                      {showEmployeeDropdown && (
                        <div className="absolute z-10 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                          {employeesWithoutAccount.filter(emp =>
                            !employeeSearch ||
                            emp.employee_name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                            emp.emp_no.toLowerCase().includes(employeeSearch.toLowerCase())
                          ).length === 0 ? (
                            <div className="p-8 text-center">
                              <UserX className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                              <p className="text-sm font-medium text-slate-500">No matching employees</p>
                            </div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {employeesWithoutAccount
                                .filter(emp =>
                                  !employeeSearch ||
                                  emp.employee_name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                                  emp.emp_no.toLowerCase().includes(employeeSearch.toLowerCase())
                                )
                                .map((emp) => (
                                  <button
                                    key={emp._id}
                                    type="button"
                                    onClick={() => {
                                      setEmployeeFormData({
                                        ...employeeFormData,
                                        employeeId: emp.emp_no,
                                        email: emp?.email || '',
                                      });
                                      setEmployeeSearch(`${emp.emp_no} - ${emp.employee_name}`);
                                      setShowEmployeeDropdown(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-xl p-3 text-left transition-colors ${employeeFormData.employeeId === emp.emp_no
                                      ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                      }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white font-bold text-slate-400 shadow-sm dark:bg-slate-800">
                                        {emp.employee_name[0]}
                                      </div>
                                      <div>
                                        <div className="text-sm font-bold text-slate-900 dark:text-white">{emp.employee_name}</div>
                                        <div className="text-[10px] font-medium text-slate-500 uppercase">{emp.emp_no} • {emp.department_id?.name || 'General'}</div>
                                      </div>
                                    </div>
                                    {employeeFormData.employeeId === emp.emp_no && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Login Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="email"
                          value={employeeFormData.email}
                          onChange={(e) => setEmployeeFormData({ ...employeeFormData, email: e.target.value })}
                          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          placeholder="email@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assigned Role *</label>
                      <div className="relative">
                        <Shield className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          value={employeeFormData.role}
                          onChange={(e) => {
                            const role = e.target.value;
                            setEmployeeFormData({
                              ...employeeFormData,
                              role,
                              dataScope: ['hr', 'sub_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                              departments: [],
                              divisionMapping: []
                            });
                          }}
                          className="w-full appearance-none rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        >
                          {ROLES.filter((r) => !['super_admin', 'employee'].includes(r.value)).map((role) => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
                    <ScopingSelector data={employeeFormData} setData={(val) => setEmployeeFormData(val)} asEmployee={true} />
                  </div>

                  <div className="flex items-start gap-4 rounded-2xl bg-amber-50 p-4 border border-amber-100 dark:bg-amber-900/10 dark:border-amber-800">
                    <Key className="h-5 w-5 text-amber-500 mt-0.5" />
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                      The system will automatically generate a secure temporary password and dispatch it via email if available.
                    </p>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowFromEmployeeDialog(false);
                        resetEmployeeForm();
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Discard
                    </button>
                    <button
                      type="submit"
                      disabled={!employeeFormData.employeeId}
                      className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
                    >
                      Upgrade Now
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Dialog */}
        {showEditDialog && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEditDialog(false)} />
            <div className="relative z-50 flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
              <div className="relative bg-gradient-to-r from-indigo-600 to-blue-600 px-8 py-6 text-white overflow-hidden">
                <button
                  onClick={() => setShowEditDialog(false)}
                  className="absolute right-4 top-4 rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md">
                    <Edit className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Edit Account</h2>
                    <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-wider opacity-80">Security & Access Configuration</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <form onSubmit={handleUpdateUser} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Account Email</label>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="email"
                          value={formData.email}
                          disabled
                          className="w-full rounded-2xl border border-slate-100 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-800/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Display Name *</label>
                      <div className="relative">
                        <UserCircle className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                          className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">System Role *</label>
                    <div className="relative">
                      <Shield className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <select
                        value={formData.role}
                        onChange={(e) => {
                          const role = e.target.value;
                          setFormData({
                            ...formData,
                            role,
                            dataScope: ['hr', 'sub_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                            divisionMapping: []
                          });
                        }}
                        disabled={selectedUser.role === 'super_admin'}
                        className="w-full appearance-none rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white disabled:opacity-50"
                      >
                        {ROLES.filter((r) => !['super_admin', 'employee'].includes(r.value)).map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                        {selectedUser.role === 'super_admin' && (
                          <option value="super_admin">Super Admin</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
                    <ScopingSelector data={formData} setData={setFormData} />
                  </div>

                  {/* Feature Control */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Feature Privileges
                      </label>
                      <span className="text-[10px] font-medium text-slate-400">Custom override configuration</span>
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 scrollbar-thin">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {MODULE_CATEGORIES.map((category) => (
                          <div key={category.code} className="space-y-2">
                            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                              <span className="text-sm">{category.icon}</span>
                              <span className="text-[10px] font-bold uppercase text-slate-400">{category.name}</span>
                            </div>
                            <div className="space-y-1">
                              {category.modules.map((module) => (
                                <label key={module.code} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={(formData.featureControl || []).includes(module.code)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormData({ ...formData, featureControl: [...(formData.featureControl || []), module.code] });
                                      } else {
                                        setFormData({ ...formData, featureControl: (formData.featureControl || []).filter(m => m !== module.code) });
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                                  />
                                  <span className="text-xs text-slate-700 dark:text-slate-300">
                                    {module.label}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditDialog(false);
                        setSelectedUser(null);
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Discard
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-700 active:scale-[0.98]"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Password Reset Dialog */}
        {showPasswordDialog && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPasswordDialog(false)} />
            <div className="relative z-50 flex w-full max-sm:max-w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-900">
              <div className="relative bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-6 text-white text-center">
                <button
                  onClick={() => setShowPasswordDialog(false)}
                  className="absolute right-4 top-4 rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 mb-3">
                  <Key className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-bold">Security Reset</h2>
                <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest opacity-80">Credential Reconstruction</p>
              </div>

              <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl">
                    <button
                      onClick={() => setResetPasswordState(prev => ({ ...prev, autoGenerate: true }))}
                      className={`flex-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${resetPasswordState.autoGenerate ? 'bg-white shadow-md text-amber-600 dark:bg-slate-700' : 'text-slate-400'}`}
                    >
                      Automated
                    </button>
                    <button
                      onClick={() => setResetPasswordState(prev => ({ ...prev, autoGenerate: false }))}
                      className={`flex-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${!resetPasswordState.autoGenerate ? 'bg-white shadow-md text-amber-600 dark:bg-slate-700' : 'text-slate-400'}`}
                    >
                      Manual
                    </button>
                  </div>

                  {!resetPasswordState.autoGenerate ? (
                    <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type={resetPasswordState.showNew ? "text" : "password"}
                            value={resetPasswordState.newPassword}
                            onChange={(e) => setResetPasswordState(prev => ({ ...prev, newPassword: e.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-12 text-sm focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            placeholder="Min. 8 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setResetPasswordState(prev => ({ ...prev, showNew: !prev.showNew }))}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors"
                          >
                            {resetPasswordState.showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>

                        {/* Enhanced Strength Meter */}
                        <div className="space-y-2 pt-2">
                          <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Security Score</span>
                            <span className={`text-[10px] font-black uppercase tracking-wider ${getPasswordStrength(resetPasswordState.newPassword).score >= 3 ? "text-emerald-500" :
                              getPasswordStrength(resetPasswordState.newPassword).score === 2 ? "text-amber-500" : "text-rose-500"
                              }`}>
                              {getPasswordStrength(resetPasswordState.newPassword).label}
                            </span>
                          </div>
                          <div className="flex gap-1.5 h-1.5 px-0.5">
                            {[1, 2, 3, 4].map((step) => (
                              <div
                                key={step}
                                className={`flex-1 rounded-full transition-all duration-700 ${getPasswordStrength(resetPasswordState.newPassword).score >= step
                                  ? getPasswordStrength(resetPasswordState.newPassword).color
                                  : 'bg-slate-100 dark:bg-slate-800'
                                  }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Confirm Password</label>
                        <div className="relative">
                          <CheckCircle className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type={resetPasswordState.showConfirm ? "text" : "password"}
                            value={resetPasswordState.confirmPassword}
                            onChange={(e) => setResetPasswordState(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className={`w-full rounded-2xl border py-3.5 pl-11 pr-12 text-sm transition-all focus:ring-4 ${resetPasswordState.confirmPassword
                              ? (resetPasswordState.confirmPassword === resetPasswordState.newPassword
                                ? 'border-emerald-500/50 bg-emerald-50/20 focus:ring-emerald-500/10 dark:border-emerald-500/30'
                                : 'border-rose-500/50 bg-rose-50/20 focus:ring-rose-500/10 dark:border-rose-500/30')
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 focus:border-amber-500 focus:ring-amber-500/10'
                              }`}
                            placeholder="••••••••••••"
                          />
                          <button
                            type="button"
                            onClick={() => setResetPasswordState(prev => ({ ...prev, showConfirm: !prev.showConfirm }))}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors"
                          >
                            {resetPasswordState.showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                        {[
                          { label: '8+ chars', met: resetPasswordState.newPassword.length >= 8 },
                          { label: 'Uppercase', met: /[A-Z]/.test(resetPasswordState.newPassword) },
                          { label: 'Number', met: /[0-9]/.test(resetPasswordState.newPassword) },
                          { label: 'Symbol', met: /[^A-Za-z0-9]/.test(resetPasswordState.newPassword) }
                        ].map((c, i) => (
                          <div key={i} className={`flex items-center gap-2 text-[10px] font-bold uppercase ${c.met ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {c.met ? <CheckCircle className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border-2 border-slate-200" />}
                            <span>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="relative group overflow-hidden rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center dark:border-amber-900/30 dark:from-amber-900/10 dark:to-orange-900/10 animate-in fade-in duration-300">
                      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-200/20 blur-2xl group-hover:bg-amber-300/30 transition-colors" />
                      <div className="relative z-10">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xl shadow-amber-500/10 dark:bg-slate-800">
                          <RefreshCw className="h-7 w-7 text-amber-500" />
                        </div>
                        <h3 className="text-lg font-bold text-amber-900 dark:text-amber-400">Smart Reset</h3>
                        <p className="mt-2 text-[11px] leading-relaxed text-amber-700/70 dark:text-amber-500/70">
                          System will generate a high-entropy 12-character password. Credentials will be securely delivered via encrypted channels.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setShowPasswordDialog(false);
                        setSelectedUser(null);
                      }}
                      className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleResetPassword}
                      disabled={!resetPasswordState.autoGenerate && (resetPasswordState.newPassword.length < 6 || resetPasswordState.newPassword !== resetPasswordState.confirmPassword)}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-white shadow-xl shadow-amber-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none"
                    >
                      Process
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* View User Dialog */}
        {showViewDialog && selectedViewUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowViewDialog(false)}
            />
            <div className="relative z-50 flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl dark:bg-slate-900">
              {/* Premium Header - Floating Style */}
              <div className="relative overflow-hidden border-b border-slate-100 px-10 py-8 dark:border-slate-800">
                <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="relative flex flex-col md:flex-row items-center gap-8">
                  <div className="relative group">
                    <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-600 text-4xl font-black text-white shadow-2xl shadow-blue-500/30 transition-transform group-hover:scale-105">
                      {selectedViewUser.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 h-8 w-8 rounded-full border-4 border-white bg-emerald-500 shadow-lg dark:border-slate-900 ${!selectedViewUser.isActive && 'bg-slate-400'}`} />
                  </div>
                  <div className="text-center md:text-left flex-1">
                    <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap">
                      <h2 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">
                        {selectedViewUser.name}
                      </h2>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-widest ${getRoleColor(selectedViewUser.role)} shadow-sm`}>
                        <Shield className="h-3.5 w-3.5" />
                        {getRoleLabel(selectedViewUser.role)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <Mail className="h-4 w-4" />
                        </div>
                        {selectedViewUser.email}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <Globe className="h-4 w-4" />
                        </div>
                        {selectedViewUser.dataScope === 'all' ? 'Global Access' : 'Restricted Scope'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowViewDialog(false)}
                    className="absolute right-0 top-0 rounded-2xl p-3 text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  >
                    <X className="h-7 w-7" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-10 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                {/* Primary Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <section>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        <Layers className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Assignments</h3>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Data Visibility Scope</div>
                        {selectedViewUser.role === 'super_admin' ? (
                          <div className="flex items-center gap-3">
                            <Globe className="h-5 w-5 text-blue-500" />
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Absolute Global Access</p>
                          </div>
                        ) : selectedViewUser.dataScope === 'all' ? (
                          <div className="flex items-center gap-3">
                            <Eye className="h-5 w-5 text-indigo-500" />
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Organization Visibility</p>
                          </div>
                        ) : selectedViewUser.dataScope === 'own' ? (
                          <div className="flex items-center gap-3">
                            <UserCircle className="h-5 w-5 text-amber-500" />
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Self-Only Protection</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Building className="h-5 w-5 text-emerald-500" />
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Specific Business Unit Mapping</p>
                          </div>
                        )}
                      </div>

                      {selectedViewUser.dataScope !== 'all' && selectedViewUser.dataScope !== 'own' && selectedViewUser.role !== 'super_admin' && (
                        <div className="space-y-3">
                          {(!selectedViewUser.divisionMapping || selectedViewUser.divisionMapping.length === 0) ? (
                            <div className="flex items-center justify-center p-6 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                              <p className="text-xs font-medium text-slate-400 italic text-center">No specific business unit associations found</p>
                            </div>
                          ) : (
                            <div className="grid gap-3">
                              {selectedViewUser.divisionMapping.map((mapping: any, idx) => {
                                const divId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                                const divisionName = divisions.find(d => d._id === divId)?.name || 'General Operations';
                                const deptIds = mapping.departments?.map((d: any) => typeof d === 'string' ? d : d._id) || [];

                                return (
                                  <div key={idx} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                                    <div className="absolute left-0 top-0 h-full w-1 bg-blue-500" />
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-sm font-bold text-slate-900 dark:text-white">{divisionName}</span>
                                      <span className="text-[10px] font-black uppercase text-blue-500/50">Primary Unit</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {deptIds.length === 0 ? (
                                        <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                          All Functional Departments
                                        </span>
                                      ) : (
                                        deptIds.map((deptId: string) => {
                                          const deptName = departments.find(d => d._id === deptId)?.name || 'Unknown Unit';
                                          return (
                                            <span key={deptId} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                              {deptName}
                                            </span>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <section>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <Lock className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Feature Access</h3>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      {!selectedViewUser.featureControl || selectedViewUser.featureControl.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl">
                          <ShieldAlert className="h-8 w-8 text-slate-300 mb-2" />
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Inherited Permissions</p>
                          <p className="mt-1 text-[11px] text-slate-400">Using standard hierarchical role defaults</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {MODULE_CATEGORIES.map(category => {
                            const enabledModules = category.modules.filter(m => selectedViewUser.featureControl?.includes(m.code));
                            if (enabledModules.length === 0) return null;

                            return (
                              <div key={category.code} className="space-y-2 pb-3 border-b border-slate-50 last:border-0 dark:border-slate-800/50">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  <span>{category.icon}</span> {category.name}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {enabledModules.map(m => (
                                    <div key={m.code} className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                                      <Check className="h-3 w-3" />
                                      {m.label}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Action Footer */}
                <div className="flex flex-col md:flex-row gap-4 pt-4">
                  <button
                    onClick={() => {
                      setShowViewDialog(false);
                      openEditDialog(selectedViewUser);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-4 text-sm font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-700"
                  >
                    <Edit className="h-4 w-4" />
                    Management Edit
                  </button>
                  <button
                    onClick={() => setShowViewDialog(false)}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Close Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md" />
            <div className="relative z-[110] w-full max-w-md scale-in-center">
              <div className="overflow-hidden rounded-[2.5rem] bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] dark:bg-slate-900">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-center text-white">
                  <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white p-5 shadow-2xl">
                    <CheckCircle className="h-16 w-16 text-emerald-500" />
                  </div>
                  <h2 className="text-3xl font-black tracking-tight">Access Granted!</h2>
                  <p className="mt-2 text-emerald-100">The account has been successfully provisioned</p>
                </div>

                <div className="p-10">
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Security Credentials</span>
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center group cursor-pointer" onClick={() => {
                          navigator.clipboard.writeText(successModalData.username);
                          // toast success
                        }}>
                          <span className="text-[10px] font-black uppercase text-slate-400">Login Identifier</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition-colors uppercase">{successModalData.username}</span>
                        </div>
                        <div className="h-px bg-slate-200/50 dark:bg-slate-800" />
                        <div className="flex justify-between items-center group cursor-pointer" onClick={() => {
                          navigator.clipboard.writeText(successModalData.password);
                          // toast success
                        }}>
                          <span className="text-[10px] font-black uppercase text-slate-400">Temporary Access Key</span>
                          <code className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 group-hover:scale-105 transition-transform">{successModalData.password}</code>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl bg-blue-50/50 p-4 border border-blue-100/50 dark:bg-blue-900/10 dark:border-blue-800/50">
                      <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                      <p className="text-[11px] leading-relaxed text-blue-700/80 dark:text-blue-400/80">
                        These credentials have been dispatched to the user's primary contact endpoint. Please ensure they update their access key upon first authentication.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowSuccessModal(false)}
                      className="w-full rounded-2xl bg-slate-900 py-4.5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-slate-900/20 transition-all hover:bg-black active:scale-[0.98] dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    >
                      Close & Dispatch
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
