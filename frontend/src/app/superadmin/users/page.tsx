/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, Department, Division, User, Employee, DataScope, Role, HolidayGroup, EmployeeGroup, UserHistoryRow } from '@/lib/api';
import {
  HolidayDivisionMappingEditor,
  normalizeHolidayMappingFromApi,
  type HolidayMappingRow,
} from '@/components/holidays/HolidayDivisionMappingEditor';
import { useAuth } from '@/contexts/AuthContext';
import { MODULE_CATEGORIES } from '@/config/moduleCategories';
import {
  getReadButtonLabel,
  getWriteButtonLabel,
  getReadButtonTitle,
  getWriteButtonTitle,
  getReleaseButtonTitle,
} from '@/lib/modulePermissionLabels';
import { useSecondSalaryFeatureEnabled } from '@/hooks/useSecondSalaryFeatureEnabled';
import ModuleGranularPermissionToggles from '@/components/users/ModuleGranularPermissionToggles';
import Spinner from '@/components/Spinner';
import {
  buildDivisionMappingFromDepartment,
  findDivisionIdForDepartment,
  getDepartmentsForDivisionDisplay,
  mappingIncludesDepartment,
  normalizeDivisionMapping,
} from '@/lib/divisionDepartmentUtils';
import {
  Plus,
  Search,
  Edit,
  Key,
  Trash2,
  RotateCw,
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
  Lock,
  Clock,
  Phone
} from 'lucide-react';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansContentPanel,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansDialogPrimaryButtonClass,
  loansDialogPrimaryButtonStyle,
  loansDialogSuccessButtonClass,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerActionButtonClass, ledgerTableActionsCellClass, ledgerTableActionsGroupClass, ledgerTableActionsHeaderClass } from '@/lib/ledgerUi';
import { UserViewDialog } from '@/components/users/UserViewDialog';
import {
  userActiveBadgeClass,
  userActiveLabel,
  userAvatarClass,
  userAvatarStyle,
  userRoleBadgeClass,
  userStatusDotClass,
} from '@/components/users/userLedgerUi';

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

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
  phone_number?: string;
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
const MONTH_SLOT_EDIT_PERMISSION = 'LEAVE_REGISTER_MONTH_EDIT:write';

// Helpers moved inside component to access dynamic roles


const hasMonthSlotEditPermission = (featureControl?: string[]) =>
  !!featureControl?.includes(MONTH_SLOT_EDIT_PERMISSION) || !!featureControl?.includes('LEAVE_REGISTER_MONTH_EDIT');

export default function UsersPage() {
  const { secondSalaryEnabled } = useSecondSalaryFeatureEnabled();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [holidayGroups, setHolidayGroups] = useState<HolidayGroup[]>([]);
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);
  const [customEmployeeGroupingEnabled, setCustomEmployeeGroupingEnabled] = useState(false);
  const [employeesWithoutAccount, setEmployeesWithoutAccount] = useState<Employee[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customRoles, setCustomRoles] = useState<Role[]>([]);
  const [systemRoleNames, setSystemRoleNames] = useState<Record<string, string>>({
    employee: 'Employee',
    manager: 'Manager',
    hod: 'Head of Department',
    hr: 'Human Resources',
    super_admin: 'Super Admin',
    sub_admin: 'Sub Admin'
  });

  const DYNAMIC_ROLES = ROLES.map(r => ({
    ...r,
    label: systemRoleNames[r.value] || r.label
  }));

  const getRoleColor = useCallback((role: string) => {
    const sysRole = ROLES.find((r) => r.value === role);
    if (sysRole) return sysRole.color;
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400';
  }, []);

  const getRoleLabel = useCallback((role: string) => {
    const sysRole = DYNAMIC_ROLES.find((r) => r.value === role);
    if (sysRole) return sysRole.label;
    const custom = customRoles.find(r => r._id === role);
    return custom ? custom.name : role;
  }, [DYNAMIC_ROLES, customRoles]);

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
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions' | 'activity'>('overview');
  const [userActivity, setUserActivity] = useState<UserHistoryRow[]>([]);
  const [loadingUserActivity, setLoadingUserActivity] = useState(false);

  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    role: 'sub_admin',
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
      const [usersRes, deptRes, divRes, statsRes, holGroupsRes, empGroupsRes, groupingSettingRes] = await Promise.all([
        api.getUsers({
          role: roleFilter || undefined,
          isActive: statusFilter ? statusFilter === 'active' : undefined,
          search: search || undefined,
        }),
        api.getDepartments(true),
        api.getDivisions(),
        api.getUserStats(),
        api.getHolidayGroupsAdmin(),
        api.getEmployeeGroups(true),
        api.getSetting('custom_employee_grouping_enabled'),
      ]);

      if (usersRes.success) setUsers(usersRes.data || []);
      if (deptRes.success) setDepartments(deptRes.data || []);
      if (divRes.success) setDivisions(divRes.data || []);
      if (statsRes.success) setStats(statsRes.data);
      if (holGroupsRes.success) setHolidayGroups(holGroupsRes.data || []);
      if (empGroupsRes.success) setEmployeeGroups(empGroupsRes.data || []);
      if (groupingSettingRes.success && groupingSettingRes.data) {
        setCustomEmployeeGroupingEnabled(!!groupingSettingRes.data.value);
      }

      const [rolesRes, resSettEmp, resSettHOD, resSettHR, resSettMgr] = await Promise.all([
        api.getRoles(),
        api.getSetting('feature_control_employee'),
        api.getSetting('feature_control_hod'),
        api.getSetting('feature_control_hr'),
        api.getSetting('feature_control_manager'),
      ]);

      if (rolesRes.success) setCustomRoles(rolesRes.data || []);

      // Update system role names from settings
      const newNames = { ...systemRoleNames };
      const val = (r: any) => r?.data?.value;
      if (resSettEmp?.success && val(resSettEmp)?.name) newNames.employee = val(resSettEmp).name;
      if (resSettHOD?.success && val(resSettHOD)?.name) newNames.hod = val(resSettHOD).name;
      if (resSettHR?.success && val(resSettHR)?.name) newNames.hr = val(resSettHR).name;
      if (resSettMgr?.success && val(resSettMgr)?.name) newNames.manager = val(resSettMgr).name;
      setSystemRoleNames(newNames);
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
    const load = async () => {
      if (!showViewDialog || !selectedViewUser?._id) return;
      if (activeTab !== 'activity') return;
      if (currentUser?.role !== 'super_admin') return;

      try {
        setLoadingUserActivity(true);
        const res = await api.getUserActivity(selectedViewUser._id, 120);
        if (res.success) setUserActivity(res.data || []);
        else setUserActivity([]);
      } catch (e) {
        console.error('Failed to load user activity:', e);
        setUserActivity([]);
      } finally {
        setLoadingUserActivity(false);
      }
    };
    load();
  }, [activeTab, showViewDialog, selectedViewUser?._id, currentUser?.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (showCreateDialog || showEditDialog || showFromEmployeeDialog) {
      api.getRoles().then(res => {
        if (res.success) setCustomRoles(res.data || []);
      });
    }
  }, [showCreateDialog, showEditDialog, showFromEmployeeDialog]);

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

      // Check for custom role
      const customRole = customRoles.find(r => r._id === formData.role);
      if (customRole) {
        setFormData(prev => ({
          ...prev,
          featureControl: customRole.activeModules || [],
          dataScope: 'department'
        }));
        return;
      }

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
        phone_number: formData.phone_number,
      };

      if (!formData.autoGeneratePassword && formData.password) {
        payload.password = formData.password;
      }

      // Handle scoping
      payload.dataScope = formData.dataScope as DataScope;

      // Always include divisionMapping if available
      if (formData.divisionMapping && formData.divisionMapping.length > 0) {
        payload.divisionMapping = (formData.divisionMapping || []).map(m => ({
          division: typeof m.division === 'string' ? m.division : m.division._id,
          departments: (m.departments || []).map(d => typeof d === 'string' ? d : d._id)
        }));
      }

      if (formData.dataScope === 'department') {
        (payload as any).department = formData.department || null;
      } else if (formData.dataScope === 'division') {
        payload.allowedDivisions = (formData.allowedDivisions || []).map(d => typeof d === 'string' ? d : d._id);

        // For Manager/HOD specific mapping if divisionMapping is not already set or needs overrides
        if (!payload.divisionMapping || payload.divisionMapping.length === 0) {
          if (formData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
            const divId = payload.allowedDivisions[0];
            const depts = (formData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
            payload.divisionMapping = [{
              division: divId,
              departments: depts
            }];
          } else if (formData.role === 'hod' && formData.division && formData.department) {
            payload.divisionMapping = [{
              division: formData.division,
              departments: [formData.department]
            }];
          }
        }
      }

      // HOD: keep full divisionMapping (multiple departments); fallback to single only when mapping empty
      if (formData.role === 'hod') {
        payload.dataScope = 'department';
        (payload as any).department = formData.department || (formData.divisionMapping?.[0]?.departments?.[0] && (typeof formData.divisionMapping[0].departments[0] === 'string' ? formData.divisionMapping[0].departments[0] : (formData.divisionMapping[0].departments[0] as any)?._id)) || null;
        (payload as any).division = formData.division || (formData.divisionMapping?.[0]?.division && (typeof formData.divisionMapping[0].division === 'string' ? formData.divisionMapping[0].division : (formData.divisionMapping[0].division as any)?._id)) || null;
        if ((!payload.divisionMapping || payload.divisionMapping.length === 0) && formData.division && formData.department) {
          payload.divisionMapping = [{
            division: formData.division,
            departments: [formData.department]
          }];
        }
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;
      (payload as any).managedHolidayGroupIds = formData.managedHolidayGroupIds || [];
      (payload as any).holidayDivisionMapping = (formData.holidayDivisionMapping || []).filter((m: HolidayMappingRow) => m.division);

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
      const payload: { employeeId: string; role: string; autoGeneratePassword: boolean; email?: string; phone_number?: string; dataScope?: DataScope | string; department?: string | null; allowedDivisions?: string[]; divisionMapping?: { division: string | Division; departments: (string | Department)[] }[]; featureControl?: string[] } = {
        employeeId: employeeFormData.employeeId || '',
        role: employeeFormData.role,
        autoGeneratePassword: employeeFormData.autoGeneratePassword,
        phone_number: employeeFormData.phone_number,
      };

      if (employeeFormData.email) {
        payload.email = employeeFormData.email;
      }

      // Handle scoping
      payload.dataScope = employeeFormData.dataScope || 'all';

      // Always include divisionMapping if available
      if (employeeFormData.divisionMapping && employeeFormData.divisionMapping.length > 0) {
        payload.divisionMapping = (employeeFormData.divisionMapping || []).map(m => ({
          division: typeof m.division === 'string' ? m.division : m.division?._id,
          departments: (m.departments || []).map(d => typeof d === 'string' ? d : d?._id)
        })) as any;
      }

      if (payload.dataScope === 'department') {
        payload.department = (employeeFormData.departments || [])[0] || null;
      } else if (payload.dataScope === 'division') {
        payload.allowedDivisions = (employeeFormData.allowedDivisions || []).map(d => typeof d === 'string' ? d : d._id);

        // For HOD/Manager specific mapping overrides
        if (!payload.divisionMapping || payload.divisionMapping.length === 0) {
          if (employeeFormData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
            const divId = payload.allowedDivisions[0];
            const depts = (employeeFormData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
            payload.divisionMapping = [{
              division: divId,
              departments: depts
            }] as any;
          } else if (employeeFormData.role === 'hod' && employeeFormData.division && (employeeFormData.departments || []).length > 0) {
            const deptIds = (employeeFormData.departments || []).map((d: any) => typeof d === 'string' ? d : d?._id);
            payload.divisionMapping = [{
              division: employeeFormData.division,
              departments: deptIds
            }] as any;
          }
        }
      }

      // HOD: keep full divisionMapping; fallback to single only when mapping empty
      if (employeeFormData.role === 'hod') {
        payload.dataScope = 'department';
        payload.department = employeeFormData.department || (employeeFormData.departments || [])[0] || (employeeFormData.divisionMapping?.[0]?.departments?.[0] && (typeof employeeFormData.divisionMapping[0].departments[0] === 'string' ? employeeFormData.divisionMapping[0].departments[0] : (employeeFormData.divisionMapping[0].departments[0] as any)?._id)) || null;
        (payload as any).division = employeeFormData.division || (employeeFormData.divisionMapping?.[0]?.division && (typeof employeeFormData.divisionMapping[0].division === 'string' ? employeeFormData.divisionMapping[0].division : (employeeFormData.divisionMapping[0].division as any)?._id)) || null;
        if ((!payload.divisionMapping || payload.divisionMapping.length === 0) && employeeFormData.division && (employeeFormData.department || (employeeFormData.departments || []).length > 0)) {
          const deptIds = (employeeFormData.departments || []).map((d: any) => typeof d === 'string' ? d : d?._id);
          payload.divisionMapping = [{
            division: employeeFormData.division,
            departments: deptIds.length > 0 ? deptIds : [employeeFormData.department]
          }] as any;
        }
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = employeeFormData.featureControl;
      (payload as any).managedHolidayGroupIds = employeeFormData.managedHolidayGroupIds || [];
      (payload as any).holidayDivisionMapping = (employeeFormData.holidayDivisionMapping || []).filter((m: HolidayMappingRow) => m.division);

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
        phone_number: formData.phone_number,
      };

      // Handle scoping
      payload.dataScope = formData.dataScope;

      // Always include divisionMapping if available
      if (formData.divisionMapping && formData.divisionMapping.length > 0) {
        payload.divisionMapping = (formData.divisionMapping || []).map(m => ({
          division: typeof m.division === 'string' ? m.division : m.division?._id,
          departments: (m.departments || []).map((d: any) => typeof d === 'string' ? d : d?._id)
        }));
      }

      if (formData.dataScope === 'department') {
        (payload as any).department = formData.department || null;
      } else if (formData.dataScope === 'division') {
        payload.allowedDivisions = formData.allowedDivisions;

        // Manager specific override
        if (formData.role === 'manager' && payload.allowedDivisions && payload.allowedDivisions.length === 1) {
          const divId = typeof payload.allowedDivisions[0] === 'string' ? payload.allowedDivisions[0] : payload.allowedDivisions[0]._id;
          const depts = (formData.departments || []).map((d: any) => typeof d === 'string' ? d : d._id);
          payload.divisionMapping = [{
            division: divId,
            departments: depts
          }];
        }
      }

      // HOD: keep full divisionMapping; fallback to single only when mapping empty
      if (formData.role === 'hod') {
        payload.dataScope = 'department';
        (payload as any).department = formData.department || (formData.divisionMapping?.[0]?.departments?.[0] && (typeof formData.divisionMapping[0].departments[0] === 'string' ? formData.divisionMapping[0].departments[0] : (formData.divisionMapping[0].departments[0] as any)?._id)) || null;
        (payload as any).division = formData.division || (formData.divisionMapping?.[0]?.division && (typeof formData.divisionMapping[0].division === 'string' ? formData.divisionMapping[0].division : (formData.divisionMapping[0].division as any)?._id)) || null;
        if ((!payload.divisionMapping || payload.divisionMapping.length === 0) && formData.division && formData.department) {
          payload.divisionMapping = [{
            division: formData.division,
            departments: [formData.department]
          }];
        }
      }

      // Add feature control (always send to ensure overrides work)
      payload.featureControl = formData.featureControl;
      (payload as any).managedHolidayGroupIds = formData.managedHolidayGroupIds || [];
      (payload as any).holidayDivisionMapping = (formData.holidayDivisionMapping || []).filter((m: HolidayMappingRow) => m.division);

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
      if (resetPasswordState.newPassword.length < 4) {
        setError('Password must be at least 4 characters');
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
        setSuccess(`User ${isNowActive ? 'activated' : 'deactivated'} successfully`);
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

  const scopingRolesKeepMapping = (role: string) =>
    ['hod', 'manager', 'hr', 'sub_admin'].includes(role);

  const defaultDataScopeForRole = (role: string) => {
    if (['hr', 'sub_admin', 'super_admin'].includes(role)) return 'all';
    if (role === 'manager') return 'division';
    if (role === 'hod') return 'department';
    return 'department';
  };

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user);

    const normalizedMapping = normalizeDivisionMapping(user.divisionMapping);

    let mapping = normalizedMapping.length > 0 ? normalizedMapping[0] : null;
    let finalMapping = normalizedMapping;

    const deptId =
      (user as any).department?._id ||
      (typeof (user as any).department === 'string' ? (user as any).department : '') ||
      String((mapping?.departments || [])[0] || '');

    if (user.role === 'hod' && deptId && (!mapping || !mapping.division)) {
      const divId = findDivisionIdForDepartment(deptId, divisions, departments);
      if (divId) {
        mapping = { division: divId, departments: [deptId] };
        finalMapping = [mapping];
      }
    }

    if (user.role === 'manager' && !mapping?.division) {
      const allowedDivId = user.allowedDivisions?.[0]
        ? (typeof user.allowedDivisions[0] === 'string' ? user.allowedDivisions[0] : (user.allowedDivisions[0] as Division)._id)
        : '';
      if (allowedDivId) {
        mapping = { division: String(allowedDivId), departments: mapping?.departments || [] };
        if (!finalMapping.length) finalMapping = [mapping];
      }
    }

    const totalDeptsFromMapping = (finalMapping || []).reduce(
      (sum: number, m) => sum + (m.departments || []).length,
      0
    );
    const isMultiple = (finalMapping || []).length > 1 || totalDeptsFromMapping > 1;

    let resolvedDataScope = user.dataScope || 'all';
    if (user.role === 'manager') {
      resolvedDataScope = 'division';
    } else if (
      finalMapping.length > 0 &&
      ['hr', 'sub_admin'].includes(user.role) &&
      resolvedDataScope === 'all'
    ) {
      resolvedDataScope = 'division';
    }

    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      departmentType: user.departmentType || (isMultiple ? 'multiple' : 'single'),
      department:
        user.role === 'hod' && mapping && mapping.departments?.length > 0
          ? mapping.departments[0]
          : deptId || (user as any).department?._id || '',
      departments:
        user.role === 'manager' && mapping
          ? mapping.departments
          : (finalMapping || []).flatMap((m) => m.departments || []),
      password: '',
      autoGeneratePassword: false,
      featureControl: user.featureControl || [],
      dataScope: resolvedDataScope,
      allowedDivisions:
        user.allowedDivisions?.map((d) => (typeof d === 'string' ? d : d?._id)) ||
        finalMapping.map((m) => m.division),
      divisionMapping: finalMapping,
      division:
        (user.role === 'hod' || user.role === 'manager') && mapping ? mapping.division : '',
      phone_number: user.phone_number || '',
      managedHolidayGroupIds: ((user as any).managedHolidayGroupIds || []).map((g: any) => typeof g === 'string' ? g : g?._id).filter(Boolean),
      holidayDivisionMapping: normalizeHolidayMappingFromApi((user as any).holidayDivisionMapping),
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


  // Reset forms
  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      role: 'sub_admin',
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
      phone_number: '',
      managedHolidayGroupIds: [],
      holidayDivisionMapping: [],
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
      phone_number: '',
      managedHolidayGroupIds: [],
      holidayDivisionMapping: [],
    });
    previousRoleRef.current = '';
  };

  const renderHolidayEmployeeScopeSection = (data: UserFormData, setData: (v: UserFormData) => void) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Holiday Employee Scope</h3>
          <p className="text-xs text-slate-500">Optional â€” direct division/department scope for holiday management</p>
        </div>
      </div>
      <HolidayDivisionMappingEditor
        mapping={(data.holidayDivisionMapping as HolidayMappingRow[]) || []}
        onChange={(rows) => setData({ ...data, holidayDivisionMapping: rows } as UserFormData)}
        divisions={divisions}
        departments={departments}
        employeeGroups={employeeGroups}
        customEmployeeGroupingEnabled={customEmployeeGroupingEnabled}
      />
    </div>
  );

  const toggleDivisionMapping = (divisionId: string, deptId: string | null, setData: React.Dispatch<React.SetStateAction<UserFormData>>, role: string) => {
    setData((prev) => {
      let newMapping = [...(prev.divisionMapping || [])];
      const existingDivisionIdx = newMapping.findIndex((m) => {
        const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
        return String(mDivId) === String(divisionId);
      });

      if (deptId === null) {
        if (existingDivisionIdx !== -1) {
          if ((newMapping[existingDivisionIdx].departments || []).length > 0) {
            newMapping[existingDivisionIdx] = { ...newMapping[existingDivisionIdx], departments: [] };
          } else {
            newMapping.splice(existingDivisionIdx, 1);
          }
        } else {
          newMapping.push({ division: divisionId, departments: [] });
        }
      } else if (existingDivisionIdx === -1) {
        newMapping.push({ division: divisionId, departments: [String(deptId)] });
      } else {
        const currentDepts = (newMapping[existingDivisionIdx].departments || []).map((d: string | Department) =>
          typeof d === 'string' ? d : String(d._id)
        );
        if (currentDepts.includes(String(deptId))) {
          newMapping[existingDivisionIdx] = {
            ...newMapping[existingDivisionIdx],
            departments: currentDepts.filter((d) => d !== String(deptId)),
          };
        } else {
          newMapping[existingDivisionIdx] = {
            ...newMapping[existingDivisionIdx],
            departments: [...currentDepts, String(deptId)],
          };
        }
      }

      const allowedDivisions = newMapping.map((m) => (typeof m.division === 'string' ? m.division : m.division?._id)).filter(Boolean);
      const first = newMapping[0];
      const next: UserFormData = { ...prev, divisionMapping: newMapping, allowedDivisions };
      if (role === 'manager') {
        next.division = first ? (typeof first.division === 'string' ? first.division : first.division?._id) || '' : '';
        next.departments = (first?.departments || []).map((d: string | Department) => (typeof d === 'string' ? d : String(d._id)));
        next.dataScope = 'division';
      } else if (role === 'hod') {
        next.division = first ? (typeof first.division === 'string' ? first.division : first.division?._id) || '' : '';
        next.department = (first?.departments || [])[0]
          ? (typeof (first.departments as (string | Department)[])[0] === 'string'
            ? (first.departments as string[])[0]
            : String((first.departments as Department[])[0]?._id))
          : '';
        next.dataScope = 'department';
      }
      return next;
    });
  };

  const DivisionMappingAccordion = ({
    data,
    setData,
    role,
    variant = 'blue',
  }: {
    data: UserFormData;
    setData: React.Dispatch<React.SetStateAction<UserFormData>>;
    role: string;
    variant?: 'amber' | 'blue';
  }) => {
    const selectedBg = variant === 'amber' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-blue-50 dark:bg-blue-900/20';
    const accentText = variant === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400';
    const checkboxAccent = variant === 'amber' ? 'text-amber-600' : 'text-blue-600';

    return (
      <div className="space-y-4">
        {divisions.map((div) => {
          const isSelected = data.divisionMapping?.some((m) => {
            const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
            return String(mDivId) === String(div._id);
          });
          const mapping = data.divisionMapping?.find((m) => {
            const mDivId = typeof m.division === 'string' ? m.division : m.division?._id;
            return String(mDivId) === String(div._id);
          });
          const deptsForDiv = getDepartmentsForDivisionDisplay(div._id, divisions, departments, mapping?.departments);

          return (
            <div key={div._id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              <div
                className={`flex items-center justify-between p-3 cursor-pointer ${isSelected ? selectedBg : ''}`}
                onClick={() => toggleDivisionMapping(div._id, null, setData, role)}
              >
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!isSelected} readOnly className={`rounded border-slate-300 ${checkboxAccent}`} />
                  <span className="text-sm font-medium dark:text-white">{div.name}</span>
                </div>
                {isSelected && (
                  <span className={`text-[10px] font-bold uppercase ${accentText}`}>
                    {(mapping?.departments || []).length === 0 ? 'All Departments' : `${mapping?.departments?.length} Dept(s)`}
                  </span>
                )}
              </div>
              {isSelected && (
                <div className="p-3 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2">
                  {deptsForDiv.map((dept) => (
                    <label key={dept._id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mappingIncludesDepartment(mapping?.departments, dept._id)}
                        onChange={() => toggleDivisionMapping(div._id, dept._id, setData, role)}
                        className={`rounded border-slate-300 ${checkboxAccent} scale-75`}
                      />
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{dept.name}</span>
                    </label>
                  ))}
                  {deptsForDiv.length === 0 && (
                    <div className="col-span-2 text-center py-2 text-[10px] text-slate-400">No departments linked to this division</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const ScopingSelector = ({ data, setData }: { data: UserFormData, setData: React.Dispatch<React.SetStateAction<UserFormData>> }) => {
    if (data.role === 'manager') {
      return (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 dark:bg-blue-900/10 dark:border-blue-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-blue-800 dark:text-blue-400 mb-2">
              <Building className="h-4 w-4" />
              Division Manager â€“ Division & Department Assignment
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-500 mb-4">
              Select division(s) and departments this manager can access (same mapping as HR / Sub Admin).
            </p>
            <DivisionMappingAccordion data={data} setData={setData} role="manager" variant="blue" />
          </div>
        </div>
      );
    }

    if (data.role === 'hod') {
      return (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 dark:bg-amber-900/10 dark:border-amber-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-400 mb-2">
              <Users className="h-4 w-4" />
              HOD â€“ Division & Department Assignment
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-500 mb-4">
              Select one or more divisions and the departments this HOD will head.
            </p>
            <DivisionMappingAccordion data={data} setData={setData} role="hod" variant="amber" />
          </div>
        </div>
      );
    }

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
            <option value="own">Self Only</option>
          </select>
        </div>

        {data.dataScope === 'division' && (
          <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Division & Department Access Mapping
            </label>
            <DivisionMappingAccordion data={data} setData={setData} role={data.role} variant="blue" />
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
      <LoansPageShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <Spinner />
        </div>
      </LoansPageShell>
    );
  }

  const hdrOutlineBtn =
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold uppercase tracking-wide transition hover:opacity-80 disabled:opacity-40';
  const hdrPrimaryBtn =
    'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:opacity-90 disabled:opacity-40';
  const hdrFieldClass =
    'h-7 border bg-white px-2 text-[11px] text-stone-900 transition focus:outline-none focus:ring-1 focus:ring-[color:var(--ps-accent)] dark:bg-stone-950 dark:text-stone-100';

  return (
    <LoansPageShell>
      <LoansPageHeader
        dense
        layout="toolbar"
        badge="System control"
        title="User management"
        subtitle="Access, roles, and activity"
        action={
          <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div aria-hidden className="min-w-0" />
            <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
              <div className="relative w-28 sm:w-36">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${hdrFieldClass} w-full pl-7`}
                  style={loansFormInputStyle()}
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={`${hdrFieldClass} w-24 sm:w-28`}
                style={loansFormInputStyle()}
                title="Role"
              >
                <option value="">All roles</option>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`${hdrFieldClass} w-24 sm:w-28`}
                style={loansFormInputStyle()}
                title="Status"
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={loadData}
                className={hdrOutlineBtn}
                style={loansDialogOutlineButtonStyle()}
              >
                <RotateCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <button
                type="button"
                onClick={openFromEmployeeDialog}
                className={hdrOutlineBtn}
                style={loansDialogOutlineButtonStyle()}
              >
                <UserPlus className="h-3 w-3" />
                From employee
              </button>
              <button
                type="button"
                onClick={() => setShowCreateDialog(true)}
                className={hdrPrimaryBtn}
                style={loansPrimaryButtonStyle()}
              >
                <Plus className="h-3 w-3" />
                New user
              </button>
            </div>
          </div>
        }
      />

      {error ? (
        <div className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300" style={ledgerBorder}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-5 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" style={ledgerBorder}>
          {success}
        </div>
      ) : null}

      {stats ? (
        <LoansStatGrid
          columns={5}
          stats={[
            { label: 'Total accounts', value: stats.totalUsers, accent: true },
            { label: 'Active users', value: stats.activeUsers, highlight: true },
            { label: 'HODs', value: stats.byRole?.hod || 0 },
            { label: 'Managers', value: stats.byRole?.manager || 0 },
            { label: 'Inactive', value: stats.inactiveUsers, muted: true },
          ]}
        />
      ) : null}

      <LoansContentPanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Access scope</th>
                <th className="px-4 py-3 text-left">Employee ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className={`px-4 py-3 ${ledgerTableActionsHeaderClass('right')}`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-stone-800" style={ledgerBorder}>
                {users.map((user) => (
                  <tr key={user._id} className="group transition-colors hover:bg-[var(--ps-accent-soft)]/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className={`${userAvatarClass()} cursor-pointer`}
                          style={userAvatarStyle()}
                          onClick={() => {
                            setSelectedViewUser(user);
                            setShowViewDialog(true);
                          }}
                        >
                          {user.name?.[0]?.toUpperCase() || '?'}
                          <span className={userStatusDotClass(!!user.isActive)} />
                        </button>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedViewUser(user);
                              setShowViewDialog(true);
                            }}
                            className="block truncate text-left text-sm font-medium text-stone-900 transition hover:text-[color:var(--ps-accent)] dark:text-stone-100"
                          >
                            {user.name}
                          </button>
                          <p className="truncate text-xs text-stone-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={userRoleBadgeClass(user.role)}>
                        <Shield className="h-3 w-3" />
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(() => {
                          const mapping = user.divisionMapping || [];
                          const depts = mapping.flatMap((m: any) =>
                            (m.departments || []).map((d: any) => ({
                              _id: typeof d === 'string' ? d : d?._id,
                              name: typeof d === 'object' && d?.name ? d.name : departments.find((dep) => dep._id === (typeof d === 'string' ? d : d?._id))?.name || 'Dept',
                            }))
                          ).filter((d: { _id?: string }) => d._id);
                          const allDivLabels = mapping
                            .filter((m: any) => !m.departments || m.departments.length === 0)
                            .map((m: any) => {
                              const divId = typeof m.division === 'string' ? m.division : m.division?._id;
                              const divName = divisions.find((d) => d._id === divId)?.name || (typeof m.division === 'object' && m.division?.name) || 'Division';
                              return { _id: `div-${divId}`, name: `All in ${divName}` };
                            });
                          const items = [...depts, ...allDivLabels];
                          return items.length > 0 ? (
                            <>
                              {items.slice(0, 2).map((item: { _id: string; name: string }, idx: number) => (
                                <span key={`${user._id}-${item._id}-${idx}`} className="flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:text-stone-400" style={ledgerBorder}>
                                  <Building className="h-2.5 w-2.5" />
                                  {item.name}
                                </span>
                              ))}
                              {items.length > 2 && (
                                <span className="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ps-accent-ink)]" style={{ ...ledgerBorder, backgroundColor: 'var(--ps-accent-soft)' }}>
                                  +{items.length - 2}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">No scope</span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs tabular-nums text-stone-600 dark:text-stone-400">
                        {user.employeeId || user.employeeRef?.emp_no || '-'}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user)}
                        disabled={user.role === 'super_admin'}
                        className={`${userActiveBadgeClass(!!user.isActive)} ${user.role === 'super_admin' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      >
                        {userActiveLabel(!!user.isActive)}
                      </button>
                    </td>
                    <td className={`px-4 py-3 ${ledgerTableActionsCellClass('right')}`}>
                      <div className={ledgerTableActionsGroupClass('right')}>
                        <button type="button" onClick={() => openEditDialog(user)} className={ledgerActionButtonClass('sky')} title="Edit">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordDialog(true);
                          }}
                          className={ledgerActionButtonClass('amber')}
                          title="Reset password"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                        {user.role !== 'super_admin' ? (
                          <button type="button" onClick={() => handleDelete(user)} className={ledgerActionButtonClass('rose')} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedViewUser(user);
                            setShowViewDialog(true);
                          }}
                          className={ledgerActionButtonClass('violet')}
                          title="View"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-t py-16 text-center" style={ledgerBorder}>
              <Users className="mb-3 h-10 w-10 text-stone-300" />
              <p className="font-serif text-lg font-light text-stone-800 dark:text-stone-100">No users found</p>
              <p className="mt-1 text-sm text-stone-500">Adjust filters or search.</p>
            </div>
          ) : null}
      </LoansContentPanel>

        <LoanDetailDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} maxWidth="max-w-6xl">
          <LoanDetailDialogHeader
            badge="User management"
            title="Create new user"
            subtitle="Add a team member and configure access"
            onClose={() => setShowCreateDialog(false)}
          />
          <div className="flex-1 overflow-y-auto">
                  <form onSubmit={handleCreateUser} className="flex flex-col lg:flex-row h-full">

                    {/* LEFT COLUMN - Main Form Fields */}
                    <div className="flex-1 p-8 space-y-6 lg:border-r lg:border-slate-200 dark:lg:border-slate-800">
                      {/* Basic Information Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10">
                            <UserCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Basic Information</h3>
                            <p className="text-xs text-slate-500">User identity and contact details</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Full Name <span className="text-rose-500">*</span>
                              </label>
                              <div className="relative">
                                <UserCircle className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="text"
                                  value={formData.name}
                                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                  required
                                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  placeholder="e.g. John Doe"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Phone Number
                              </label>
                              <div className="relative">
                                <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="tel"
                                  value={formData.phone_number}
                                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  placeholder="e.g. +91 9876543210"
                                />
                              </div>
                            </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Email Address <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                placeholder="john@example.com"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              System Role <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <Shield className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <select
                                value={formData.role}
                                onChange={(e) => {
                                  const roleId = e.target.value;
                                  const customRole = customRoles.find(r => r._id === roleId);
                                  const newPermissions = customRole ? (customRole.activeModules || []) : formData.featureControl;

                                  const keepMapping = scopingRolesKeepMapping(roleId) && scopingRolesKeepMapping(formData.role);
                                  setFormData({
                                    ...formData,
                                    role: roleId,
                                    featureControl: newPermissions,
                                    dataScope: defaultDataScopeForRole(roleId),
                                    department: keepMapping ? formData.department : '',
                                    departments: keepMapping ? formData.departments : [],
                                    divisionMapping: keepMapping ? formData.divisionMapping : [],
                                    division: keepMapping ? formData.division : '',
                                  });
                                }}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              >
                                {ROLES.filter(r => r.value !== 'employee' && (r.value !== 'super_admin' || currentUser?.role === 'super_admin')).map((role) => (
                                  <option key={role.value} value={role.value}>
                                    {role.label}
                                  </option>
                                ))}
                                {customRoles.map(role => (
                                  <option key={role._id} value={role._id}>{role.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                                  Leave register month edit privilege
                                </p>
                                <p className="text-[11px] text-indigo-700/90 dark:text-indigo-300/90">
                                  Allows admin month-slot edits in leave register.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = formData.featureControl || [];
                                  const has = hasMonthSlotEditPermission(current);
                                  const next = has
                                    ? current.filter((f) => f !== MONTH_SLOT_EDIT_PERMISSION && f !== 'LEAVE_REGISTER_MONTH_EDIT')
                                    : [...current, MONTH_SLOT_EDIT_PERMISSION];
                                  setFormData({ ...formData, featureControl: next });
                                }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${hasMonthSlotEditPermission(formData.featureControl)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                  }`}
                              >
                                {hasMonthSlotEditPermission(formData.featureControl) ? 'Enabled' : 'Disabled'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Password Configuration Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
                            <Lock className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Password Configuration</h3>
                            <p className="text-xs text-slate-500">Set initial access credentials</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="flex items-center gap-3 cursor-pointer group rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-800/50">
                            <div className={`relative flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${formData.autoGeneratePassword ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'}`}>
                              {formData.autoGeneratePassword && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={formData.autoGeneratePassword}
                                onChange={(e) => setFormData({ ...formData, autoGeneratePassword: e.target.checked })}
                              />
                            </div>
                            <div className="flex-1">
                              <span className="block text-sm font-semibold text-slate-900 dark:text-white">Auto-generate secure password</span>
                              <span className="text-xs text-slate-500">System will create and email a temporary password</span>
                            </div>
                          </label>

                          {!formData.autoGeneratePassword && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Password <span className="text-rose-500">*</span>
                              </label>
                              <div className="relative">
                                <Key className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="password"
                                  value={formData.password}
                                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                  placeholder="Enter a secure password"
                                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Access Scoping Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                            <Building className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Access Scoping</h3>
                            <p className="text-xs text-slate-500">Define organizational access boundaries</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                          <ScopingSelector data={formData} setData={setFormData} />
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowCreateDialog(false)}
                          className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.98]"
                        >
                          Create User Account
                        </button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN - Feature Privileges */}
                    <div className="flex-1 p-8 space-y-6 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
                            <Users className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Holiday Group Scope</h3>
                            <p className="text-xs text-slate-500">Assign which holiday groups this user can manage</p>
                          </div>
                        </div>

                        {holidayGroups.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                            No holiday groups found.
                          </div>
                        ) : (
                          <div className="max-h-56 overflow-y-auto space-y-2 pr-2">
                            {holidayGroups.map((g) => {
                              const selected = (formData.managedHolidayGroupIds || []).includes(g._id);
                              return (
                                <label key={g._id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-800/40 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...(formData.managedHolidayGroupIds || []), g._id]))
                                        : (formData.managedHolidayGroupIds || []).filter((id: string) => id !== g._id);
                                      setFormData({ ...formData, managedHolidayGroupIds: next });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{g.name}</div>
                                    {g.description && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.description}</div>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {renderHolidayEmployeeScopeSection(formData, setFormData)}

                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10">
                              <Layers className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Feature Privileges</h3>
                              <p className="text-xs text-slate-500">Grant read/write access to modules</p>
                            </div>
                          </div>

                          {/* Bulk Selection Buttons */}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                                const readPermissions = allModules.map(code => `${code}:read`);
                                const existingWrite = (formData.featureControl || []).filter(fc => fc.endsWith(':write'));
                                setFormData({ ...formData, featureControl: [...readPermissions, ...existingWrite] });
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
                            >
                              Read All
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                                const readPermissions = allModules.map(code => `${code}:read`);
                                const writePermissions = allModules.map(code => `${code}:write`);
                                setFormData({ ...formData, featureControl: [...readPermissions, ...writePermissions] });
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 transition-colors"
                            >
                              Write All
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {MODULE_CATEGORIES.map((category) => (
                            <div key={category.code} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                              <div className="mb-3 flex items-center gap-2">
                                <span className="text-lg">{category.icon}</span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{category.name}</h4>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                {category.modules.map((module) => {
                                  const hasRead = formData.featureControl?.includes(`${module.code}:read`) || false;
                                  const hasWrite = formData.featureControl?.includes(`${module.code}:write`) || false;
                                  const hasVerify = (module as any).verifiable ? (formData.featureControl?.includes(`${module.code}:verify`) || false) : false;

                                  const toggleRead = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const readPerm = `${module.code}:read`;
                                    const writePerm = `${module.code}:write`;
                                    let newFeatures;

                                    if (hasRead) {
                                      // Remove read AND write
                                      newFeatures = currentFeatures.filter(f => f !== readPerm && f !== writePerm);
                                    } else {
                                      // Add read
                                      newFeatures = [...currentFeatures, readPerm];
                                    }
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  const toggleWrite = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const writePerm = `${module.code}:write`;
                                    const readPerm = `${module.code}:read`;
                                    let newFeatures;

                                    if (hasWrite) {
                                      // Remove write
                                      newFeatures = currentFeatures.filter(f => f !== writePerm);
                                    } else {
                                      // Add write AND ensure read is present
                                      newFeatures = Array.from(new Set([...currentFeatures, writePerm, readPerm]));
                                    }
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  const toggleVerify = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const verifyPerm = `${module.code}:verify`;
                                    const newFeatures = hasVerify
                                      ? currentFeatures.filter(f => f !== verifyPerm)
                                      : [...currentFeatures, verifyPerm];
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  return (
                                    <div
                                      key={module.code}
                                      className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-white dark:hover:bg-slate-700/50"
                                    >
                                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{module.label}</span>
                                      <div className="flex flex-wrap gap-2 justify-end max-w-[70%]">
                                        <button
                                          type="button"
                                          onClick={toggleRead}
                                          title={getReadButtonTitle(module.code)}
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasRead
                                            ? 'bg-blue-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          {getReadButtonLabel(module.code)}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={toggleWrite}
                                          title={getWriteButtonTitle(module.code)}
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasWrite
                                            ? 'bg-emerald-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          {getWriteButtonLabel(module.code)}
                                        </button>
                                        {(module as any).terminable && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentFeatures = formData.featureControl || [];
                                              const terminatePerm = `${module.code}:terminate`;
                                              const hasTerminate = currentFeatures.includes(terminatePerm);
                                              const newFeatures = hasTerminate
                                                ? currentFeatures.filter(f => f !== terminatePerm)
                                                : [...currentFeatures, terminatePerm];
                                              setFormData({ ...formData, featureControl: newFeatures });
                                            }}
                                            title="Terminate: grants access to initiate and manage employee terminations within scope. Independent of Read/Write."
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${formData.featureControl?.includes(`${module.code}:terminate`)
                                              ? 'bg-orange-500 text-white shadow-sm'
                                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                              }`}
                                          >
                                            Terminate
                                          </button>
                                        )}
                                        {(module as any).releasable && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentFeatures = formData.featureControl || [];
                                              const releasePerm = `${module.code}:release`;
                                              const hasRelease = currentFeatures.includes(releasePerm);
                                              const newFeatures = hasRelease
                                                ? currentFeatures.filter(f => f !== releasePerm)
                                                : [...currentFeatures, releasePerm];
                                              setFormData({ ...formData, featureControl: newFeatures });
                                            }}
                                            title={getReleaseButtonTitle(module.code)}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${formData.featureControl?.includes(`${module.code}:release`)
                                              ? 'bg-teal-500 text-white shadow-sm'
                                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                              }`}
                                          >
                                            Release
                                          </button>
                                        )}
                                        <ModuleGranularPermissionToggles
                                          module={module as any}
                                          featureControl={formData.featureControl}
                                          onChange={(featureControl) => setFormData({ ...formData, featureControl })}
                                          secondSalaryOrgEnabled={secondSalaryEnabled}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </form>
          </div>
        </LoanDetailDialog>

        <LoanDetailDialog open={showFromEmployeeDialog} onClose={() => setShowFromEmployeeDialog(false)} maxWidth="max-w-6xl">
          <LoanDetailDialogHeader
            badge="User management"
            title="Create from employee"
            subtitle="Upgrade an employee record to a system user"
            onClose={() => setShowFromEmployeeDialog(false)}
          />
          <div className="flex-1 overflow-y-auto">
                <form onSubmit={handleCreateFromEmployee} className="flex flex-col lg:flex-row h-full">

                  {/* LEFT COLUMN - Main Form Fields */}
                  <div className="flex-1 p-8 space-y-6 lg:border-r lg:border-slate-200 dark:lg:border-slate-800">
                    {/* Employee Selection Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                          <UserCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Select Employee</h3>
                          <p className="text-xs text-slate-500">Choose an employee to grant system access</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Search Employee <span className="text-rose-500">*</span>
                        </label>
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
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 pr-10 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-transform"
                            >
                              <ChevronRight className={`h-4 w-4 transition-transform ${showEmployeeDropdown ? 'rotate-90' : ''}`} />
                            </button>
                          </div>

                          {showEmployeeDropdown && (
                            <div className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                              {employeesWithoutAccount.filter(emp =>
                                !employeeSearch ||
                                emp.employee_name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                                emp.emp_no.toLowerCase().includes(employeeSearch.toLowerCase())
                              ).length === 0 ? (
                                <div className="p-6 text-center">
                                  <UserX className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                                  <p className="text-sm font-medium text-slate-500">No matching employees found</p>
                                  <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
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
                                          const deptId =
                                            emp.department_id?._id ||
                                            (typeof emp.department_id === 'string' ? emp.department_id : '');
                                          const initialMapping = buildDivisionMappingFromDepartment(
                                            deptId,
                                            divisions,
                                            departments
                                          );
                                          const divId = initialMapping[0]?.division || '';
                                          setEmployeeFormData({
                                            ...employeeFormData,
                                            employeeId: emp.emp_no,
                                            email: emp?.email || '',
                                            divisionMapping: initialMapping,
                                            division: divId,
                                            department: deptId,
                                            allowedDivisions: divId ? [divId] : [],
                                            dataScope:
                                              initialMapping.length > 0 &&
                                              !['hr', 'sub_admin', 'super_admin'].includes(employeeFormData.role)
                                                ? 'division'
                                                : employeeFormData.dataScope,
                                          });
                                          setEmployeeSearch(`${emp.emp_no} - ${emp.employee_name}`);
                                          setShowEmployeeDropdown(false);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-lg p-3 text-left transition-all ${employeeFormData.employeeId === emp.emp_no
                                          ? 'bg-emerald-50 ring-2 ring-emerald-500/20 dark:bg-emerald-900/20'
                                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                          }`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 font-bold text-sm text-white shadow-sm">
                                            {emp.employee_name[0]}
                                          </div>
                                          <div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">{emp.employee_name}</div>
                                            <div className="text-xs text-slate-500">{emp.emp_no} â€¢ {emp.department_id?.name || 'General'}</div>
                                          </div>
                                        </div>
                                        {employeeFormData.employeeId === emp.emp_no && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Account Configuration Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10">
                          <Shield className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Account Configuration</h3>
                          <p className="text-xs text-slate-500">Set login credentials and permissions</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Phone Number
                          </label>
                          <div className="relative">
                            <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="tel"
                              value={employeeFormData.phone_number}
                              onChange={(e) => setEmployeeFormData({ ...employeeFormData, phone_number: e.target.value })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder="e.g. +1 234 567 890"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Login Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                              type="email"
                              value={employeeFormData.email}
                              onChange={(e) => setEmployeeFormData({ ...employeeFormData, email: e.target.value })}
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder="email@example.com"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            System Role <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <Shield className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <select
                              value={employeeFormData.role}
                              onChange={(e) => {
                                const roleId = e.target.value;
                                const customRole = customRoles.find(r => r._id === roleId);
                                const newPermissions = customRole ? (customRole.activeModules || []) : employeeFormData.featureControl;

                                const keepMapping = scopingRolesKeepMapping(roleId) && scopingRolesKeepMapping(employeeFormData.role);
                                setEmployeeFormData({
                                  ...employeeFormData,
                                  role: roleId,
                                  featureControl: newPermissions,
                                  dataScope: defaultDataScopeForRole(roleId),
                                  departments: keepMapping ? employeeFormData.departments : [],
                                  divisionMapping: keepMapping ? employeeFormData.divisionMapping : [],
                                  division: keepMapping ? employeeFormData.division : '',
                                });
                              }}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {DYNAMIC_ROLES.filter((r) => r.value !== 'employee' && (r.value !== 'super_admin' || currentUser?.role === 'super_admin')).map((role) => (
                                <option key={role.value} value={role.value}>{role.label}</option>
                              ))}
                              {customRoles.map(role => (
                                <option key={role._id} value={role._id}>{role.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                                Leave register month edit privilege
                              </p>
                              <p className="text-[11px] text-indigo-700/90 dark:text-indigo-300/90">
                                Allows admin month-slot edits in leave register.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const current = employeeFormData.featureControl || [];
                                const has = hasMonthSlotEditPermission(current);
                                const next = has
                                  ? current.filter((f) => f !== MONTH_SLOT_EDIT_PERMISSION && f !== 'LEAVE_REGISTER_MONTH_EDIT')
                                  : [...current, MONTH_SLOT_EDIT_PERMISSION];
                                setEmployeeFormData({ ...employeeFormData, featureControl: next });
                              }}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${hasMonthSlotEditPermission(employeeFormData.featureControl)
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                }`}
                            >
                              {hasMonthSlotEditPermission(employeeFormData.featureControl) ? 'Enabled' : 'Disabled'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Access Scoping Card */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
                          <Building className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Access Scoping</h3>
                          <p className="text-xs text-slate-500">Define organizational access boundaries</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                        <ScopingSelector data={employeeFormData} setData={setEmployeeFormData} />
                      </div>
                    </div>

                    {/* Info Banner */}
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/10">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-800/30">
                        <Key className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 mb-1">Auto-generated Password</p>
                        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                          A secure temporary password will be automatically generated and sent to the employee&apos;s email address.
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowFromEmployeeDialog(false);
                          resetEmployeeForm();
                        }}
                        className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!employeeFormData.employeeId}
                        className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:shadow-xl hover:shadow-emerald-500/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Upgrade Employee
                      </button>
                    </div>
                  </div>

                  {/* RIGHT COLUMN - Feature Privileges */}
                  <div className="flex-1 p-8 space-y-6 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Holiday Group Scope</h3>
                          <p className="text-xs text-slate-500">Assign which holiday groups this user can manage</p>
                        </div>
                      </div>

                      {holidayGroups.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                          No holiday groups found.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-2 pr-2">
                          {holidayGroups.map((g) => {
                            const selected = (employeeFormData.managedHolidayGroupIds || []).includes(g._id);
                            return (
                              <label key={g._id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-800/40 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? Array.from(new Set([...(employeeFormData.managedHolidayGroupIds || []), g._id]))
                                      : (employeeFormData.managedHolidayGroupIds || []).filter((id: string) => id !== g._id);
                                    setEmployeeFormData({ ...employeeFormData, managedHolidayGroupIds: next });
                                  }}
                                  className="mt-1 h-4 w-4"
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{g.name}</div>
                                  {g.description && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.description}</div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {renderHolidayEmployeeScopeSection(employeeFormData, setEmployeeFormData)}

                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="mb-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10">
                            <Layers className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Feature Privileges</h3>
                            <p className="text-xs text-slate-500">Grant read/write access to modules</p>
                          </div>
                        </div>

                        {/* Bulk Selection Buttons */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                              const readPermissions = allModules.map(code => `${code}:read`);
                              const existingWrite = (employeeFormData.featureControl || []).filter(fc => fc.endsWith(':write'));
                              setEmployeeFormData({ ...employeeFormData, featureControl: [...readPermissions, ...existingWrite] });
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
                          >
                            Read All
                          </button>
                            <button
                              type="button"
                              onClick={() => {
                                const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                                const readPermissions = allModules.map(code => `${code}:read`);
                                const writePermissions = allModules.map(code => `${code}:write`);
                                setEmployeeFormData({ ...employeeFormData, featureControl: [...readPermissions, ...writePermissions] });
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 transition-colors"
                            >
                              Write All
                            </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {MODULE_CATEGORIES.map((category) => (
                          <div key={category.code} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                            <div className="mb-3 flex items-center gap-2">
                              <span className="text-lg">{category.icon}</span>
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{category.name}</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              {category.modules.map((module) => {
                                const hasRead = employeeFormData.featureControl?.includes(`${module.code}:read`) || false;
                                const hasWrite = employeeFormData.featureControl?.includes(`${module.code}:write`) || false;
                                const hasVerify = (module as any).verifiable ? (employeeFormData.featureControl?.includes(`${module.code}:verify`) || false) : false;

                                const toggleRead = () => {
                                  const currentFeatures = employeeFormData.featureControl || [];
                                  const readPerm = `${module.code}:read`;
                                  const writePerm = `${module.code}:write`;
                                  let newFeatures;

                                  if (hasRead) {
                                    // Remove read AND write
                                    newFeatures = currentFeatures.filter(f => f !== readPerm && f !== writePerm);
                                  } else {
                                    // Add read
                                    newFeatures = [...currentFeatures, readPerm];
                                  }
                                  setEmployeeFormData({ ...employeeFormData, featureControl: newFeatures });
                                };

                                const toggleWrite = () => {
                                  const currentFeatures = employeeFormData.featureControl || [];
                                  const writePerm = `${module.code}:write`;
                                  const readPerm = `${module.code}:read`;
                                  let newFeatures;

                                  if (hasWrite) {
                                    // Remove write
                                    newFeatures = currentFeatures.filter(f => f !== writePerm);
                                  } else {
                                    // Add write AND ensure read is present
                                    newFeatures = Array.from(new Set([...currentFeatures, writePerm, readPerm]));
                                  }
                                  setEmployeeFormData({ ...employeeFormData, featureControl: newFeatures });
                                };

                                const toggleVerify = () => {
                                  const currentFeatures = employeeFormData.featureControl || [];
                                  const verifyPerm = `${module.code}:verify`;
                                  const newFeatures = hasVerify
                                    ? currentFeatures.filter(f => f !== verifyPerm)
                                    : [...currentFeatures, verifyPerm];
                                  setEmployeeFormData({ ...employeeFormData, featureControl: newFeatures });
                                };

                                return (
                                  <div
                                    key={module.code}
                                    className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-white dark:hover:bg-slate-700/50"
                                  >
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{module.label}</span>
                                    <div className="flex flex-wrap gap-2 justify-end max-w-[70%]">
                                      <button
                                        type="button"
                                        onClick={toggleRead}
                                        title={getReadButtonTitle(module.code)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasRead
                                          ? 'bg-blue-500 text-white shadow-sm'
                                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                          }`}
                                      >
                                        {getReadButtonLabel(module.code)}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={toggleWrite}
                                        title={getWriteButtonTitle(module.code)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasWrite
                                          ? 'bg-emerald-500 text-white shadow-sm'
                                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                          }`}
                                      >
                                        {getWriteButtonLabel(module.code)}
                                      </button>
                                      {(module as any).terminable && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentFeatures = employeeFormData.featureControl || [];
                                            const terminatePerm = `${module.code}:terminate`;
                                            const hasTerminate = currentFeatures.includes(terminatePerm);
                                            const newFeatures = hasTerminate
                                              ? currentFeatures.filter(f => f !== terminatePerm)
                                              : [...currentFeatures, terminatePerm];
                                            setEmployeeFormData({ ...employeeFormData, featureControl: newFeatures });
                                          }}
                                          title="Terminate: grants access to initiate and manage employee terminations within scope. Independent of Read/Write."
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${employeeFormData.featureControl?.includes(`${module.code}:terminate`)
                                            ? 'bg-orange-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          Terminate
                                        </button>
                                      )}
                                      {(module as any).releasable && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentFeatures = employeeFormData.featureControl || [];
                                            const releasePerm = `${module.code}:release`;
                                            const hasRelease = currentFeatures.includes(releasePerm);
                                            const newFeatures = hasRelease
                                              ? currentFeatures.filter(f => f !== releasePerm)
                                              : [...currentFeatures, releasePerm];
                                            setEmployeeFormData({ ...employeeFormData, featureControl: newFeatures });
                                          }}
                                          title={getReleaseButtonTitle(module.code)}
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${employeeFormData.featureControl?.includes(`${module.code}:release`)
                                            ? 'bg-teal-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          Release
                                        </button>
                                      )}
                                      <ModuleGranularPermissionToggles
                                        module={module as any}
                                        featureControl={employeeFormData.featureControl}
                                        onChange={(featureControl) => setEmployeeFormData({ ...employeeFormData, featureControl })}
                                        secondSalaryOrgEnabled={secondSalaryEnabled}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </form>
          </div>
        </LoanDetailDialog>

        {selectedUser ? (
        <LoanDetailDialog open={showEditDialog} onClose={() => setShowEditDialog(false)} maxWidth="max-w-6xl">
          <LoanDetailDialogHeader
            badge="User management"
            title="Edit user"
            subtitle={selectedUser.name || selectedUser.email}
            onClose={() => setShowEditDialog(false)}
          />
          <div className="flex-1 overflow-y-auto">
                  <form onSubmit={handleUpdateUser} className="flex flex-col lg:flex-row h-full">

                    {/* LEFT COLUMN - Main Form Fields */}
                    <div className="flex-1 p-8 space-y-6 lg:border-r lg:border-slate-200 dark:lg:border-slate-800">
                      {/* Account Information Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10">
                            <UserCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Account Information</h3>
                            <p className="text-xs text-slate-500">User identity and role configuration</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Email Address
                            </label>
                            <div className="relative">
                              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                type="email"
                                value={formData.email}
                                disabled
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pl-11 text-sm font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/50"
                              />
                              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                                  Read-only
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500">Email address cannot be changed</p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Display Name <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <UserCircle className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Phone Number
                            </label>
                            <div className="relative">
                              <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <input
                                type="tel"
                                value={formData.phone_number}
                                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 placeholder-slate-400 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                placeholder="e.g. +91 9876543210"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                              System Role <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                              <Shield className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                              <select
                                value={formData.role}
                                onChange={(e) => {
                                  const roleId = e.target.value;
                                  const customRole = customRoles.find(r => r._id === roleId);
                                  const newPermissions = customRole ? (customRole.activeModules || []) : formData.featureControl;

                                  const keepMapping = scopingRolesKeepMapping(roleId) && scopingRolesKeepMapping(formData.role);
                                  setFormData({
                                    ...formData,
                                    role: roleId,
                                    featureControl: newPermissions,
                                    dataScope: defaultDataScopeForRole(roleId),
                                    divisionMapping: keepMapping ? formData.divisionMapping : [],
                                    division: keepMapping ? formData.division : '',
                                    departments: keepMapping ? formData.departments : [],
                                  });
                                }}
                                disabled={selectedUser.role === 'super_admin' && currentUser?.role !== 'super_admin'}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-slate-900 transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {ROLES.filter((r) => r.value !== 'employee' && (r.value !== 'super_admin' || currentUser?.role === 'super_admin')).map((role) => (
                                  <option key={role.value} value={role.value}>
                                    {role.label}
                                  </option>
                                ))}
                                {customRoles.map(role => (
                                  <option key={role._id} value={role._id}>{role.name}</option>
                                ))}
                                {selectedUser.role === 'super_admin' && currentUser?.role !== 'super_admin' && (
                                  <option value="super_admin">Super Admin</option>
                                )}
                              </select>
                            </div>
                            {selectedUser.role === 'super_admin' && (
                              <p className="text-xs text-amber-600 dark:text-amber-500">Super Admin role cannot be changed</p>
                            )}
                          </div>

                          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                                  Leave register month edit privilege
                                </p>
                                <p className="text-[11px] text-indigo-700/90 dark:text-indigo-300/90">
                                  Allows admin month-slot edits in leave register.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const current = formData.featureControl || [];
                                  const has = hasMonthSlotEditPermission(current);
                                  const next = has
                                    ? current.filter((f) => f !== MONTH_SLOT_EDIT_PERMISSION && f !== 'LEAVE_REGISTER_MONTH_EDIT')
                                    : [...current, MONTH_SLOT_EDIT_PERMISSION];
                                  setFormData({ ...formData, featureControl: next });
                                }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${hasMonthSlotEditPermission(formData.featureControl)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                  }`}
                              >
                                {hasMonthSlotEditPermission(formData.featureControl) ? 'Enabled' : 'Disabled'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Access Scoping Card */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                            <Building className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Access Scoping</h3>
                            <p className="text-xs text-slate-500">Define organizational access boundaries</p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                          <ScopingSelector data={formData} setData={setFormData} />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
                            <Users className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Holiday Group Scope</h3>
                            <p className="text-xs text-slate-500">Assign which holiday groups this user can manage</p>
                          </div>
                        </div>

                        {holidayGroups.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                            No holiday groups found.
                          </div>
                        ) : (
                          <div className="max-h-56 overflow-y-auto space-y-2 pr-2">
                            {holidayGroups.map((g) => {
                              const selected = (formData.managedHolidayGroupIds || []).includes(g._id);
                              return (
                                <label key={g._id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 dark:hover:bg-slate-800/40 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...(formData.managedHolidayGroupIds || []), g._id]))
                                        : (formData.managedHolidayGroupIds || []).filter((id: string) => id !== g._id);
                                      setFormData({ ...formData, managedHolidayGroupIds: next });
                                    }}
                                    className="mt-1 h-4 w-4"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{g.name}</div>
                                    {g.description && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.description}</div>
                                    )}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {renderHolidayEmployeeScopeSection(formData, setFormData)}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowEditDialog(false);
                            setSelectedUser(null);
                          }}
                          className="flex-1 rounded-xl border-2 border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Saving Changes...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN - Feature Privileges */}
                    <div className="flex-1 p-8 space-y-6 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="mb-5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10">
                              <Layers className="h-5 w-5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Feature Privileges</h3>
                              <p className="text-xs text-slate-500">Grant read/write access to modules</p>
                            </div>
                          </div>

                          {/* Bulk Selection Buttons */}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                                const readPermissions = allModules.map(code => `${code}:read`);
                                const existingWrite = (formData.featureControl || []).filter(fc => fc.endsWith(':write'));
                                setFormData({ ...formData, featureControl: [...readPermissions, ...existingWrite] });
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
                            >
                              Read All
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const allModules = MODULE_CATEGORIES.flatMap(cat => cat.modules.map(m => m.code));
                                const readPermissions = allModules.map(code => `${code}:read`);
                                const writePermissions = allModules.map(code => `${code}:write`);
                                setFormData({ ...formData, featureControl: [...readPermissions, ...writePermissions] });
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 transition-colors"
                            >
                              Write All
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {MODULE_CATEGORIES.map((category) => (
                            <div key={category.code} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                              <div className="mb-3 flex items-center gap-2">
                                <span className="text-lg">{category.icon}</span>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{category.name}</h4>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                {category.modules.map((module) => {
                                  const hasRead = formData.featureControl?.includes(`${module.code}:read`) || false;
                                  const hasWrite = formData.featureControl?.includes(`${module.code}:write`) || false;
                                  const hasVerify = (module as any).verifiable ? (formData.featureControl?.includes(`${module.code}:verify`) || false) : false;

                                  const toggleRead = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const readPerm = `${module.code}:read`;
                                    const writePerm = `${module.code}:write`;
                                    let newFeatures;

                                    if (hasRead) {
                                      // Remove read AND write
                                      newFeatures = currentFeatures.filter(f => f !== readPerm && f !== writePerm);
                                    } else {
                                      // Add read
                                      newFeatures = [...currentFeatures, readPerm];
                                    }
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  const toggleWrite = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const writePerm = `${module.code}:write`;
                                    const readPerm = `${module.code}:read`;
                                    let newFeatures;

                                    if (hasWrite) {
                                      // Remove write
                                      newFeatures = currentFeatures.filter(f => f !== writePerm);
                                    } else {
                                      // Add write AND ensure read is present
                                      newFeatures = Array.from(new Set([...currentFeatures, writePerm, readPerm]));
                                    }
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  const toggleVerify = () => {
                                    const currentFeatures = formData.featureControl || [];
                                    const verifyPerm = `${module.code}:verify`;
                                    const newFeatures = hasVerify
                                      ? currentFeatures.filter(f => f !== verifyPerm)
                                      : [...currentFeatures, verifyPerm];
                                    setFormData({ ...formData, featureControl: newFeatures });
                                  };

                                  return (
                                    <div
                                      key={module.code}
                                      className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-white dark:hover:bg-slate-700/50"
                                    >
                                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{module.label}</span>
                                      <div className="flex flex-wrap gap-2 justify-end max-w-[70%]">
                                        <button
                                          type="button"
                                          onClick={toggleRead}
                                          title={getReadButtonTitle(module.code)}
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasRead
                                            ? 'bg-blue-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          {getReadButtonLabel(module.code)}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={toggleWrite}
                                          title={getWriteButtonTitle(module.code)}
                                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${hasWrite
                                            ? 'bg-emerald-500 text-white shadow-sm'
                                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                            }`}
                                        >
                                          {getWriteButtonLabel(module.code)}
                                        </button>
                                        {(module as any).terminable && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentFeatures = formData.featureControl || [];
                                              const terminatePerm = `${module.code}:terminate`;
                                              const hasTerminate = currentFeatures.includes(terminatePerm);
                                              const newFeatures = hasTerminate
                                                ? currentFeatures.filter(f => f !== terminatePerm)
                                                : [...currentFeatures, terminatePerm];
                                              setFormData({ ...formData, featureControl: newFeatures });
                                            }}
                                            title="Terminate: grants access to initiate and manage employee terminations within scope. Independent of Read/Write."
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${formData.featureControl?.includes(`${module.code}:terminate`)
                                              ? 'bg-orange-500 text-white shadow-sm'
                                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                              }`}
                                          >
                                            Terminate
                                          </button>
                                        )}
                                        {(module as any).releasable && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentFeatures = formData.featureControl || [];
                                              const releasePerm = `${module.code}:release`;
                                              const hasRelease = currentFeatures.includes(releasePerm);
                                              const newFeatures = hasRelease
                                                ? currentFeatures.filter(f => f !== releasePerm)
                                                : [...currentFeatures, releasePerm];
                                              setFormData({ ...formData, featureControl: newFeatures });
                                            }}
                                            title={getReleaseButtonTitle(module.code)}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${formData.featureControl?.includes(`${module.code}:release`)
                                              ? 'bg-teal-500 text-white shadow-sm'
                                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                              }`}
                                          >
                                            Release
                                          </button>
                                        )}
                                        <ModuleGranularPermissionToggles
                                          module={module as any}
                                          featureControl={formData.featureControl}
                                          onChange={(featureControl) => setFormData({ ...formData, featureControl })}
                                          secondSalaryOrgEnabled={secondSalaryEnabled}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </form>
          </div>
        </LoanDetailDialog>
        ) : null}

        {selectedUser ? (
        <LoanDetailDialog open={showPasswordDialog} onClose={() => setShowPasswordDialog(false)} maxWidth="max-w-md">
          <LoanDetailDialogHeader
            badge="Security"
            title="Reset password"
            subtitle={selectedUser.name || selectedUser.email}
            onClose={() => setShowPasswordDialog(false)}
          />
          <LoanDetailDialogBody>
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
                              placeholder="Min. 4 characters"
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
                              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordDialog(false);
                          setSelectedUser(null);
                        }}
                        className={`flex-1 ${loansDialogOutlineButtonClass()}`}
                        style={loansDialogOutlineButtonStyle()}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={!resetPasswordState.autoGenerate && (resetPasswordState.newPassword.length < 4 || resetPasswordState.newPassword !== resetPasswordState.confirmPassword)}
                        className={`flex-1 ${loansDialogPrimaryButtonClass()}`}
                        style={loansDialogPrimaryButtonStyle()}
                      >
                        Reset password
                      </button>
                    </div>
                  </div>
          </LoanDetailDialogBody>
        </LoanDetailDialog>
        ) : null}

        {selectedViewUser ? (
        <UserViewDialog
          open={showViewDialog}
          onClose={() => setShowViewDialog(false)}
          user={selectedViewUser}
          divisions={divisions}
          departments={departments}
          getRoleLabel={getRoleLabel}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onEdit={() => {
            if (!selectedViewUser) return;
            setShowViewDialog(false);
            openEditDialog(selectedViewUser);
          }}
          showActivityTab={currentUser?.role === 'super_admin'}
          loadingUserActivity={loadingUserActivity}
          userActivity={userActivity}
        />
        ) : null}


        <LoanDetailDialog open={showSuccessModal} onClose={() => setShowSuccessModal(false)} maxWidth="max-w-md" layerClass="z-[100]">
          <LoanDetailDialogHeader
            badge="Provisioning"
            title="Account created"
            subtitle="Share these credentials securely with the user"
            onClose={() => setShowSuccessModal(false)}
          />
          <LoanDetailDialogBody>
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle className="mb-3 h-12 w-12 text-emerald-500" />
              <p className="text-sm text-stone-600 dark:text-stone-400">The account has been successfully provisioned.</p>
            </div>
            <div className="space-y-4 border p-4" style={ledgerBorder}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Login</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(successModalData.username)}
                  className="text-sm font-medium text-stone-900 dark:text-stone-100"
                >
                  {successModalData.username}
                </button>
              </div>
              <div className="h-px bg-stone-200 dark:bg-stone-800" />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Password</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(successModalData.password)}
                  className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  {successModalData.password}
                </button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-stone-500">
              Ask the user to change their password on first login.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className={loansDialogSuccessButtonClass(true)}
            >
              Done
            </button>
          </LoanDetailDialogBody>
        </LoanDetailDialog>
    </LoansPageShell>
  );
}
