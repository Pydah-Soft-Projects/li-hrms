/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Department, Division, User, Employee, DataScope } from '@/lib/api';
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
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'sub_admin', label: 'Sub Admin', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'hr', label: 'HR', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
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
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedViewUser, setSelectedViewUser] = useState<User | null>(null);

  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    role: 'employee',
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
      } = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        autoGeneratePassword: formData.autoGeneratePassword,
        assignWorkspace: true,
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
  const handleResetPassword = async (autoGenerate: boolean) => {
    if (!selectedUser) return;
    setError('');

    try {
      const res = await api.resetUserPassword(selectedUser._id, { autoGenerate });

      if (res.success) {
        setSuccess('Password reset successfully');
        if (res.data?.newPassword) {
          setSuccessModalData({
            username: selectedUser.email,
            password: res.data.newPassword,
            message: 'Password has been reset successfully.'
          });
          setShowSuccessModal(true);
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

    // Normalize divisionMapping to IDs
    const normalizedMapping = (user.divisionMapping || []).map(m => ({
      division: typeof m.division === 'string' ? m.division : m.division?._id,
      departments: (m.departments || []).map((d: any) => typeof d === 'string' ? d : d?._id)
    }));

    // For HOD, prioritize the managed department from division mapping
    const hodDepartmentId = user.role === 'hod' && normalizedMapping.length > 0 && normalizedMapping[0].departments?.length > 0
      ? normalizedMapping[0].departments[0]
      : '';

    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      departmentType: user.departmentType || (user.departments && user.departments.length > 1 ? 'multiple' : 'single'),
      department: hodDepartmentId || user.department?._id || '',
      departments: user.departments?.map((d) => d._id) || [],
      password: '',
      autoGeneratePassword: false,
      featureControl: user.featureControl || [],
      dataScope: user.dataScope || 'all',
      allowedDivisions: user.allowedDivisions?.map(d => typeof d === 'string' ? d : d?._id) || [],
      divisionMapping: normalizedMapping,
      division: user.role === 'hod' && normalizedMapping.length > 0
        ? normalizedMapping[0].division
        : '',
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

      if (existingDivisionIdx === -1) {
        newMapping.push({ division: divisionId, departments: [] });
        existingDivisionIdx = newMapping.length - 1;
      }

      if (deptId === null) {
        // Toggle "All Departments" for this division (empty array means all)
        // If it already has specific departments, clear them to make it "All"
        // If it's already "All", maybe keep it as is (or remove division?)
        newMapping[existingDivisionIdx] = { ...newMapping[existingDivisionIdx], departments: [] };
      } else {
        // Toggle specific department
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
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
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
                This user will be assigned as the Manager for the selected Division. They will have access to all data within this division.
              </p>
            </div>
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
          dataScope: 'division' // Implicitly set datascope
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
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
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
              <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
            <button
              onClick={openFromEmployeeDialog}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
            >
              <UserIcon />
              Update User
            </button>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl"
            >
              <PlusIcon />
              Create User
            </button>
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
      <div className="text-sm text-slate-500 dark:text-slate-400">HR Users</div>

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
                  <td className="px-6 py-4 cursor-pointer" onClick={() => {
                    setSelectedViewUser(user);
                    setShowViewDialog(true);
                  }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-semibold">
                        {user.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {user.name}
                        </div>
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
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditDialog(user)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:bg-slate-700"
                        title="Edit"
                      >
                        <EditIcon />
                      </button>
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
                      {user.role !== 'super_admin' && (
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
                        dataScope: ['hr', 'sub_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                        department: '',
                        departments: [],
                        divisionMapping: []
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



                <ScopingSelector data={formData} setData={setFormData} />

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
                          {category.modules.map((module) => (
                            <label key={module.code} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer">
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
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                        dataScope: ['hr', 'sub_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                        departments: [],
                        divisionMapping: []
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



                <ScopingSelector data={employeeFormData} setData={(val) => setEmployeeFormData(val)} asEmployee={true} />

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
                          {category.modules.map((module) => (
                            <label key={module.code} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={(employeeFormData.featureControl || []).includes(module.code)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEmployeeFormData({ ...employeeFormData, featureControl: [...(employeeFormData.featureControl || []), module.code] });
                                  } else {
                                    setEmployeeFormData({ ...employeeFormData, featureControl: (employeeFormData.featureControl || []).filter(m => m !== module.code) });
                                  }
                                }}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                        dataScope: ['hr', 'sub_admin'].includes(role) ? 'all' : (role === 'hod' ? 'division' : 'department'),
                        divisionMapping: []
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



                <ScopingSelector data={formData} setData={setFormData} />

                {/* Feature Control */}

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
                          {category.modules.map((module) => (
                            <label key={module.code} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 cursor-pointer">
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
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
      {/* View User Dialog */}
      {showViewDialog && selectedViewUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowViewDialog(false)}
          />
          <div className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl dark:bg-slate-900">
            {/* Header */}
            <div className="relative border-b border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-2xl font-bold text-white shadow-lg shadow-blue-500/20">
                    {selectedViewUser.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {selectedViewUser.name}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedViewUser.email}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${getRoleColor(selectedViewUser.role)}`}>
                        {getRoleLabel(selectedViewUser.role)}
                      </span>
                      <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-lg ${selectedViewUser.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {selectedViewUser.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowViewDialog(false)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Access Scope Section */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Access Scope & Assignments
                  </h3>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                  {selectedViewUser.role === 'super_admin' ? (
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Super Admin has full global access to all divisions and departments.
                    </p>
                  ) : selectedViewUser.dataScope === 'all' ? (
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Global Access - Can view data across all divisions and departments.
                    </p>
                  ) : selectedViewUser.dataScope === 'own' ? (
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Restricted Access - Can only view their own data.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Division/Dept Hierarchy Display */}
                      {(!selectedViewUser.divisionMapping || selectedViewUser.divisionMapping.length === 0) ? (
                        <div className="text-sm text-slate-500 italic">No specific assignments found.</div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {selectedViewUser.divisionMapping.map((mapping: any, idx) => {
                            const divId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                            const divisionName = divisions.find(d => d._id === divId)?.name || 'Unknown Division';
                            const deptIds = mapping.departments?.map((d: any) => typeof d === 'string' ? d : d._id) || [];

                            return (
                              <div key={idx} className="rounded-xl border border-white bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                                <div className="mb-2 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  {divisionName}
                                </div>
                                <div className="pl-3.5 border-l-2 border-slate-100 dark:border-slate-700">
                                  {deptIds.length === 0 ? (
                                    <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded dark:bg-blue-900/30 dark:text-blue-400">
                                      All Departments
                                    </span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {deptIds.map((deptId: string) => {
                                        const deptName = departments.find(d => d._id === deptId)?.name || 'Unknown Dept';
                                        return (
                                          <span key={deptId} className="inline-block rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                            {deptName}
                                          </span>
                                        );
                                      })}
                                    </div>
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

              {/* Feature Control Section */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Feature Controls
                  </h3>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                  {!selectedViewUser.featureControl || selectedViewUser.featureControl.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No specific feature overrides. User inherits default role permissions.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {MODULE_CATEGORIES.map(category => {
                        const enabledModules = category.modules.filter(m => selectedViewUser.featureControl?.includes(m.code));
                        if (enabledModules.length === 0) return null;

                        return (
                          <div key={category.code} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <span>{category.icon}</span> {category.name}
                            </div>
                            <div className="space-y-1">
                              {enabledModules.map(m => (
                                <div key={m.code} className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                                  <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
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

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={() => setShowViewDialog(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowViewDialog(false);
                  openEditDialog(selectedViewUser);
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-600 hover:to-indigo-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit User
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
