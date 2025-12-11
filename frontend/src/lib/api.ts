const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Workspace types - defined first as they're used in ApiResponse
export interface WorkspaceModule {
  moduleId: {
    _id: string;
    name: string;
    code: string;
    icon: string;
    route: string;
  };
  moduleCode: string;
  permissions: {
    canView?: boolean;
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canApprove?: boolean;
    canForward?: boolean;
    canExport?: boolean;
  };
  dataScope: 'own' | 'department' | 'assigned' | 'all';
  settings?: any;
  isEnabled: boolean;
  sortOrder: number;
}

export interface Workspace {
  _id: string;
  name: string;
  code: string;
  type: 'employee' | 'department' | 'hr' | 'subadmin' | 'superadmin' | 'custom';
  description?: string;
  theme?: {
    primaryColor?: string;
    icon?: string;
    layout?: string;
  };
  modules: WorkspaceModule[];
  defaultModuleCode?: string;
  role?: string;
  isPrimary?: boolean;
  scopeConfig?: {
    departments?: string[];
    allDepartments?: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  dataSource?: string;
  // For backward compatibility with various response formats
  durations?: any[];
  count?: number;
  warnings?: string[];
  // For workspace responses
  workspaces?: Workspace[];
  activeWorkspace?: Workspace;
  workspace?: Workspace;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    roles: string[];
    department?: string;
  };
  workspaces?: Workspace[];
  activeWorkspace?: Workspace;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Merge existing headers if any
  if (options.headers) {
    const existingHeaders = options.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[API Request] ${options.method || 'GET'} ${url}`, options.body ? JSON.parse(options.body as string) : '');
    
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();
    console.log(`[API Response] ${response.status} ${url}`, data);

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'An error occurred',
        error: data.error || data.message || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      ...data,
    };
  } catch (error) {
    console.error(`[API Error] ${options.method || 'GET'} ${API_BASE_URL}${endpoint}`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error occurred',
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

export interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  duration: number;
  payableShifts?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Setting {
  _id: string;
  key: string;
  value: any;
  description?: string;
  category: string;
}

export interface Department {
  _id: string;
  name: string;
  code?: string;
  description?: string;
  hod?: any;
  hr?: any;
  attendanceConfig: {
    lateInLimit: number;
    earlyOutLimit: number;
    lateInGraceTime: number;
    earlyOutGraceTime: number;
  };
  permissionPolicy: {
    dailyLimit: number;
    monthlyLimit: number;
    deductFromSalary: boolean;
    deductionAmount: number;
  };
  autoDeductionRules: Array<{
    trigger: 'late_in' | 'early_out' | 'permission';
    count: number;
    action: 'half_day' | 'full_day' | 'deduct_amount';
    amount?: number;
  }>;
  shifts?: any[];
  paidLeaves?: number;
  leaveLimits?: {
    casual: number;
    sick: number;
    earned: number;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const api = {
  login: async (email: string, password: string) => {
    return apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  // Payroll include-missing setting (global)
  getIncludeMissingSetting: async () => {
    return apiRequest<Setting>('/settings/include_missing_employee_components', { method: 'GET' });
  },
  saveIncludeMissingSetting: async (value: boolean) => {
    return apiRequest<Setting>('/settings', {
      method: 'POST',
      body: JSON.stringify({
        key: 'include_missing_employee_components',
        value,
        category: 'payroll',
        description: 'Include Missing Allowances & Deductions for Employees',
      }),
    });
  },

  // Employee allowance/deduction defaults (resolved with includeMissing)
  getEmployeeComponentDefaults: async (params: { departmentId: string; grossSalary: number; empNo?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('departmentId', params.departmentId);
    searchParams.set('grossSalary', String(params.grossSalary));
    if (params.empNo) searchParams.set('empNo', params.empNo);
    return apiRequest<any>(`/employees/components/defaults?${searchParams.toString()}`, { method: 'GET' });
  },

  // Get current user profile
  getCurrentUser: async () => {
    return apiRequest<{
      user: {
        _id: string;
        name: string;
        email: string;
        role: string;
        roles: string[];
        department?: { _id: string; name: string };
        employeeId?: string;
        employeeRef?: string;
        phone?: string;
        isActive: boolean;
        createdAt: string;
        lastLogin?: string;
      };
      workspaces: any[];
      activeWorkspace: any;
    }>('/auth/me', { method: 'GET' });
  },

  // Change password
  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiRequest<{ message: string }>('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // Update user profile
  updateProfile: async (data: { name?: string; phone?: string }) => {
    return apiRequest<any>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Shifts
  getShifts: async (isActive?: boolean) => {
    const query = isActive !== undefined ? `?isActive=${String(isActive)}` : '';
    return apiRequest<Shift[]>(`/shifts${query}`, { method: 'GET' });
  },

  getShift: async (id: string) => {
    return apiRequest<Shift>(`/shifts/${id}`, { method: 'GET' });
  },

  createShift: async (data: { name: string; startTime?: string; endTime?: string; duration?: number }) => {
    return apiRequest<Shift>('/shifts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateShift: async (id: string, data: Partial<Shift>) => {
    return apiRequest<Shift>(`/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteShift: async (id: string) => {
    return apiRequest<void>(`/shifts/${id}`, { method: 'DELETE' });
  },

  getAllowedDurations: async () => {
    return apiRequest<{ data: number[]; durations: any[] }>('/shifts/durations', { method: 'GET' });
  },

  // Shift Durations
  getShiftDurations: async () => {
    return apiRequest<{ success: boolean; count: number; data: number[]; durations: any[] }>('/shifts/durations/all', { method: 'GET' });
  },

  createShiftDuration: async (data: { duration: number; label?: string }) => {
    return apiRequest<any>('/shifts/durations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateShiftDuration: async (id: string, data: { duration?: number; label?: string; isActive?: boolean }) => {
    return apiRequest<any>(`/shifts/durations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteShiftDuration: async (id: string) => {
    return apiRequest<void>(`/shifts/durations/${id}`, { method: 'DELETE' });
  },

  // Users
  getUsers: async (filters?: { role?: string; department?: string; isActive?: boolean; search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/users${query}`, { method: 'GET' });
  },

  getUser: async (id: string) => {
    return apiRequest<any>(`/users/${id}`, { method: 'GET' });
  },

  getUserStats: async () => {
    return apiRequest<any>('/users/stats', { method: 'GET' });
  },

  getEmployeesWithoutAccount: async () => {
    return apiRequest<any>('/users/employees-without-account', { method: 'GET' });
  },

  createUser: async (data: {
    email: string;
    password?: string;
    name: string;
    role: string;
    roles?: string[];
    department?: string;
    departments?: string[];
    employeeId?: string;
    autoGeneratePassword?: boolean;
    assignWorkspace?: boolean;
  }) => {
    return apiRequest<any>('/users/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createUserFromEmployee: async (data: {
    employeeId: string;
    email?: string;
    password?: string;
    role: string;
    roles?: string[];
    departments?: string[];
    autoGeneratePassword?: boolean;
  }) => {
    return apiRequest<any>('/users/from-employee', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateUser: async (id: string, data: any) => {
    return apiRequest<any>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  resetUserPassword: async (id: string, data: { newPassword?: string; autoGenerate?: boolean }) => {
    return apiRequest<any>(`/users/${id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  toggleUserStatus: async (id: string) => {
    return apiRequest<any>(`/users/${id}/toggle-status`, { method: 'PUT' });
  },

  deleteUser: async (id: string) => {
    return apiRequest<any>(`/users/${id}`, { method: 'DELETE' });
  },

  // Departments
  getDepartments: async (isActive?: boolean) => {
    const query = isActive !== undefined ? `?isActive=${isActive}` : '';
    return apiRequest<Department[]>(`/departments${query}`, { method: 'GET' });
  },

  getDepartment: async (id: string) => {
    return apiRequest<Department>(`/departments/${id}`, { method: 'GET' });
  },

  getDepartmentEmployees: async (id: string) => {
    return apiRequest<any[]>(`/departments/${id}/employees`, { method: 'GET' });
  },

  createDepartment: async (data: Partial<Department>) => {
    return apiRequest<Department>('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateDepartment: async (id: string, data: Partial<Department>) => {
    return apiRequest<Department>(`/departments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteDepartment: async (id: string) => {
    return apiRequest<void>(`/departments/${id}`, { method: 'DELETE' });
  },

  // Department Settings
  getDepartmentSettings: async (deptId: string) => {
    return apiRequest<any>(`/departments/${deptId}/settings`, { method: 'GET' });
  },

  updateDepartmentSettings: async (deptId: string, data: {
    leaves?: {
      leavesPerDay?: number | null;
      paidLeavesCount?: number | null;
      dailyLimit?: number | null;
      monthlyLimit?: number | null;
    };
    loans?: {
      interestRate?: number | null;
      isInterestApplicable?: boolean | null;
      minTenure?: number | null;
      maxTenure?: number | null;
      minAmount?: number | null;
      maxAmount?: number | null;
      maxPerEmployee?: number | null;
      maxActivePerEmployee?: number | null;
      minServicePeriod?: number | null;
    };
    salaryAdvance?: {
      interestRate?: number | null;
      isInterestApplicable?: boolean | null;
      minTenure?: number | null;
      maxTenure?: number | null;
      minAmount?: number | null;
      maxAmount?: number | null;
      maxPerEmployee?: number | null;
      maxActivePerEmployee?: number | null;
      minServicePeriod?: number | null;
    };
    permissions?: {
      perDayLimit?: number | null;
      monthlyLimit?: number | null;
      deductFromSalary?: boolean | null;
      deductionAmount?: number | null;
    };
  }) => {
    return apiRequest<any>(`/departments/${deptId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getResolvedDepartmentSettings: async (deptId: string, type?: 'leaves' | 'loans' | 'salary_advance' | 'permissions' | 'ot' | 'overtime' | 'all') => {
    const query = type ? `?type=${type}` : '';
    return apiRequest<any>(`/departments/${deptId}/settings/resolved${query}`, { method: 'GET' });
  },

  assignHOD: async (id: string, hodId: string) => {
    return apiRequest<Department>(`/departments/${id}/assign-hod`, {
      method: 'PUT',
      body: JSON.stringify({ hodId }),
    });
  },

  assignHR: async (id: string, hrId: string) => {
    return apiRequest<Department>(`/departments/${id}/assign-hr`, {
      method: 'PUT',
      body: JSON.stringify({ hrId }),
    });
  },

  assignShifts: async (id: string, shiftIds: string[]) => {
    return apiRequest<Department>(`/departments/${id}/shifts`, {
      method: 'PUT',
      body: JSON.stringify({ shiftIds }),
    });
  },

  // Designations
  getDesignations: async (departmentId: string) => {
    return apiRequest<any[]>(`/departments/${departmentId}/designations`, { method: 'GET' });
  },

  getDesignation: async (id: string) => {
    return apiRequest<any>(`/departments/designations/${id}`, { method: 'GET' });
  },

  createDesignation: async (departmentId: string, data: any) => {
    return apiRequest<any>(`/departments/${departmentId}/designations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateDesignation: async (id: string, data: any) => {
    return apiRequest<any>(`/departments/designations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteDesignation: async (id: string) => {
    return apiRequest<void>(`/departments/designations/${id}`, { method: 'DELETE' });
  },

  assignShiftsToDesignation: async (id: string, shiftIds: string[]) => {
    return apiRequest<any>(`/departments/designations/${id}/shifts`, {
      method: 'PUT',
      body: JSON.stringify({ shiftIds }),
    });
  },

  // Settings
  getSettings: async (category?: string) => {
    const query = category ? `?category=${category}` : '';
    return apiRequest<Setting[]>(`/settings${query}`, { method: 'GET' });
  },

  getSetting: async (key: string) => {
    return apiRequest<Setting>(`/settings/${key}`, { method: 'GET' });
  },

  upsertSetting: async (data: { key: string; value: any; description?: string; category?: string }) => {
    return apiRequest<Setting>('/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Permission Deduction Settings
  getPermissionDeductionSettings: async () => {
    return apiRequest<any>('/permissions/settings/deduction', { method: 'GET' });
  },

  savePermissionDeductionSettings: async (data: { deductionRules: any }) => {
    return apiRequest<any>('/permissions/settings/deduction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Attendance Deduction Settings
  getAttendanceDeductionSettings: async () => {
    return apiRequest<any>('/attendance/settings/deduction', { method: 'GET' });
  },

  saveAttendanceDeductionSettings: async (data: { deductionRules: any }) => {
    return apiRequest<any>('/attendance/settings/deduction', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Early-Out Settings
  getEarlyOutSettings: async () => {
    return apiRequest<any>('/attendance/settings/early-out', { method: 'GET' });
  },

  saveEarlyOutSettings: async (data: { isEnabled?: boolean; allowedDurationMinutes?: number; minimumDuration?: number; deductionRanges?: any[] }) => {
    return apiRequest<any>('/attendance/settings/early-out', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  addEarlyOutRange: async (data: { minMinutes: number; maxMinutes: number; deductionType: string; deductionAmount?: number; description?: string }) => {
    return apiRequest<any>('/attendance/settings/early-out/ranges', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateEarlyOutRange: async (rangeId: string, data: { minMinutes?: number; maxMinutes?: number; deductionType?: string; deductionAmount?: number; description?: string }) => {
    return apiRequest<any>(`/attendance/settings/early-out/ranges/${rangeId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteEarlyOutRange: async (rangeId: string) => {
    return apiRequest<any>(`/attendance/settings/early-out/ranges/${rangeId}`, {
      method: 'DELETE',
    });
  },

  updateSetting: async (key: string, data: { value: any; description?: string; category?: string }) => {
    return apiRequest<Setting>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Employees
  getEmployees: async (filters?: { is_active?: boolean; department_id?: string; designation_id?: string }) => {
    const params = new URLSearchParams();
    if (filters?.is_active !== undefined) params.append('is_active', String(filters.is_active));
    if (filters?.department_id) params.append('department_id', filters.department_id);
    if (filters?.designation_id) params.append('designation_id', filters.designation_id);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/employees${query}`, { method: 'GET' });
  },

  getEmployee: async (empNo: string) => {
    return apiRequest<any>(`/employees/${empNo}`, { method: 'GET' });
  },

  createEmployee: async (data: any) => {
    return apiRequest<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateEmployee: async (empNo: string, data: any) => {
    return apiRequest<any>(`/employees/${empNo}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Employee Applications
  createEmployeeApplication: async (data: any) => {
    return apiRequest<any>('/employee-applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getEmployeeApplications: async (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<any[]>(`/employee-applications${query}`, { method: 'GET' });
  },

  getEmployeeApplication: async (id: string) => {
    return apiRequest<any>(`/employee-applications/${id}`, { method: 'GET' });
  },

  approveEmployeeApplication: async (id: string, data: { approvedSalary?: number; doj?: string; comments?: string }) => {
    return apiRequest<any>(`/employee-applications/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  rejectEmployeeApplication: async (id: string, data: { comments?: string }) => {
    return apiRequest<any>(`/employee-applications/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Employee Application Form Settings
  getFormSettings: async () => {
    return apiRequest<any>('/employee-applications/form-settings', { method: 'GET' });
  },
  initializeFormSettings: async () => {
    return apiRequest<any>('/employee-applications/form-settings/initialize', {
      method: 'POST',
    });
  },
  updateFormSettings: async (data: any) => {
    return apiRequest<any>('/employee-applications/form-settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  addFormGroup: async (data: any) => {
    return apiRequest<any>('/employee-applications/form-settings/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateFormGroup: async (groupId: string, data: any) => {
    return apiRequest<any>(`/employee-applications/form-settings/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteFormGroup: async (groupId: string) => {
    return apiRequest<any>(`/employee-applications/form-settings/groups/${groupId}`, {
      method: 'DELETE',
    });
  },
  addFormField: async (groupId: string, data: any) => {
    return apiRequest<any>(`/employee-applications/form-settings/groups/${groupId}/fields`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateFormField: async (groupId: string, fieldId: string, data: any) => {
    return apiRequest<any>(`/employee-applications/form-settings/groups/${groupId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteFormField: async (groupId: string, fieldId: string) => {
    return apiRequest<any>(`/employee-applications/form-settings/groups/${groupId}/fields/${fieldId}`, {
      method: 'DELETE',
    });
  },

  // Qualifications management
  updateQualificationsConfig: async (isEnabled: boolean) => {
    return apiRequest<any>('/employee-applications/form-settings/qualifications', {
      method: 'PUT',
      body: JSON.stringify({ isEnabled }),
    });
  },
  addQualificationsField: async (data: {
    id: string;
    label: string;
    type: string;
    isRequired?: boolean;
    isEnabled?: boolean;
    placeholder?: string;
    validation?: any;
    options?: Array<{ label: string; value: string }>;
    order?: number;
  }) => {
    return apiRequest<any>('/employee-applications/form-settings/qualifications/fields', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateQualificationsField: async (fieldId: string, data: {
    label?: string;
    isRequired?: boolean;
    isEnabled?: boolean;
    placeholder?: string;
    validation?: any;
    options?: Array<{ label: string; value: string }>;
    order?: number;
  }) => {
    return apiRequest<any>(`/employee-applications/form-settings/qualifications/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteQualificationsField: async (fieldId: string) => {
    return apiRequest<any>(`/employee-applications/form-settings/qualifications/fields/${fieldId}`, {
      method: 'DELETE',
    });
  },

  deleteEmployee: async (empNo: string) => {
    return apiRequest<any>(`/employees/${empNo}`, { method: 'DELETE' });
  },

  getEmployeeCount: async (is_active?: boolean) => {
    const query = is_active !== undefined ? `?is_active=${is_active}` : '';
    return apiRequest<any>(`/employees/count${query}`, { method: 'GET' });
  },

  getEmployeeSettings: async () => {
    return apiRequest<any>('/employees/settings', { method: 'GET' });
  },

  // Workspaces
  getMyWorkspaces: async () => {
    return apiRequest<any>('/workspaces/my-workspaces', { method: 'GET' });
  },

  switchWorkspace: async (workspaceId: string) => {
    return apiRequest<any>('/workspaces/switch', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
  },

  getWorkspaces: async () => {
    return apiRequest<any>('/workspaces', { method: 'GET' });
  },

  getWorkspace: async (id: string) => {
    return apiRequest<any>(`/workspaces/${id}`, { method: 'GET' });
  },

  createWorkspace: async (data: any) => {
    return apiRequest<any>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateWorkspace: async (id: string, data: any) => {
    return apiRequest<any>(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteWorkspace: async (id: string) => {
    return apiRequest<any>(`/workspaces/${id}`, { method: 'DELETE' });
  },

  // Workspace modules
  addModuleToWorkspace: async (workspaceId: string, data: any) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/modules`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateWorkspaceModule: async (workspaceId: string, moduleCode: string, data: any) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/modules/${moduleCode}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  removeModuleFromWorkspace: async (workspaceId: string, moduleCode: string) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/modules/${moduleCode}`, { method: 'DELETE' });
  },

  // Workspace users
  getWorkspaceUsers: async (workspaceId: string) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/users`, { method: 'GET' });
  },

  assignUserToWorkspace: async (workspaceId: string, data: { userId: string; role?: string; isPrimary?: boolean; scopeConfig?: any }) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeUserFromWorkspace: async (workspaceId: string, userId: string) => {
    return apiRequest<any>(`/workspaces/${workspaceId}/users/${userId}`, { method: 'DELETE' });
  },

  // Modules (system modules management)
  getModules: async () => {
    return apiRequest<any>('/workspaces/modules', { method: 'GET' });
  },

  getModule: async (id: string) => {
    return apiRequest<any>(`/workspaces/modules/${id}`, { method: 'GET' });
  },

  createModule: async (data: any) => {
    return apiRequest<any>('/workspaces/modules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateModule: async (id: string, data: any) => {
    return apiRequest<any>(`/workspaces/modules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteModule: async (id: string) => {
    return apiRequest<any>(`/workspaces/modules/${id}`, { method: 'DELETE' });
  },

  // ==========================================
  // LEAVE MANAGEMENT
  // ==========================================

  // Get my leaves
  getMyLeaves: async (filters?: { status?: string; fromDate?: string; toDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/leaves/my${query}`, { method: 'GET' });
  },

  // Get all leaves (admin)
  getLeaves: async (filters?: { status?: string; employeeId?: string; department?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/leaves${query}`, { method: 'GET' });
  },

  // Get single leave
  getLeave: async (id: string) => {
    return apiRequest<any>(`/leaves/${id}`, { method: 'GET' });
  },

  // Apply for leave
  applyLeave: async (data: any) => {
    return apiRequest<any>('/leaves', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update leave
  updateLeave: async (id: string, data: any) => {
    return apiRequest<any>(`/leaves/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Cancel leave
  cancelLeave: async (id: string, reason?: string) => {
    return apiRequest<any>(`/leaves/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Get pending leave approvals
  getPendingLeaveApprovals: async () => {
    return apiRequest<any>('/leaves/pending-approvals', { method: 'GET' });
  },

  // Process leave action (approve/reject/forward)
  processLeaveAction: async (id: string, action: 'approve' | 'reject' | 'forward', comments?: string) => {
    return apiRequest<any>(`/leaves/${id}/action`, {
      method: 'PUT',
      body: JSON.stringify({ action, comments }),
    });
  },

  // Revoke leave approval (within 2-3 hours)
  revokeLeaveApproval: async (id: string, reason?: string) => {
    return apiRequest<any>(`/leaves/${id}/revoke`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Get approved records for a date (for conflict checking)
  getApprovedRecordsForDate: async (employeeId: string, employeeNumber: string, date: string) => {
    const params = new URLSearchParams();
    if (employeeId) params.append('employeeId', employeeId);
    if (employeeNumber) params.append('employeeNumber', employeeNumber);
    if (date) params.append('date', date);
    return apiRequest<any>(`/leaves/approved-records?${params.toString()}`, {
      method: 'GET',
    });
  },

  // Get leave statistics
  getLeaveStats: async (filters?: { employeeId?: string; department?: string; year?: string }) => {
    const params = new URLSearchParams();
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.year) params.append('year', filters.year);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/leaves/stats${query}`, { method: 'GET' });
  },

  // Delete leave
  deleteLeave: async (id: string) => {
    return apiRequest<any>(`/leaves/${id}`, { method: 'DELETE' });
  },

  // Get leave conflicts for attendance date
  getLeaveConflicts: async (employeeNumber: string, date: string) => {
    return apiRequest<any>(`/leaves/conflicts?employeeNumber=${employeeNumber}&date=${date}`, {
      method: 'GET',
    });
  },

  // Revoke leave for attendance (full-day leave)
  revokeLeaveForAttendance: async (leaveId: string) => {
    return apiRequest<any>(`/leaves/${leaveId}/revoke-for-attendance`, {
      method: 'POST',
    });
  },

  // Update leave for attendance (multi-day leave adjustments)
  updateLeaveForAttendance: async (leaveId: string, employeeNumber: string, date: string) => {
    return apiRequest<any>(`/leaves/${leaveId}/update-for-attendance`, {
      method: 'POST',
      body: JSON.stringify({ employeeNumber, date }),
    });
  },

  // ==========================================
  // OD (ON DUTY) MANAGEMENT
  // ==========================================

  // Get my ODs
  getMyODs: async (filters?: { status?: string; fromDate?: string; toDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/leaves/od/my${query}`, { method: 'GET' });
  },

  // Get all ODs (admin)
  getODs: async (filters?: { status?: string; employeeId?: string; department?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/leaves/od${query}`, { method: 'GET' });
  },

  // Get single OD
  getOD: async (id: string) => {
    return apiRequest<any>(`/leaves/od/${id}`, { method: 'GET' });
  },

  // Apply for OD
  applyOD: async (data: any) => {
    return apiRequest<any>('/leaves/od', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update OD
  updateOD: async (id: string, data: any) => {
    return apiRequest<any>(`/leaves/od/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Cancel OD
  cancelOD: async (id: string, reason?: string) => {
    return apiRequest<any>(`/leaves/od/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Get pending OD approvals
  getPendingODApprovals: async () => {
    return apiRequest<any>('/leaves/od/pending-approvals', { method: 'GET' });
  },

  // Process OD action (approve/reject/forward)
  processODAction: async (id: string, action: 'approve' | 'reject' | 'forward', comments?: string) => {
    return apiRequest<any>(`/leaves/od/${id}/action`, {
      method: 'PUT',
      body: JSON.stringify({ action, comments }),
    });
  },

  // Revoke OD approval (within 2-3 hours)
  revokeODApproval: async (id: string, reason?: string) => {
    return apiRequest<any>(`/leaves/od/${id}/revoke`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Update OD outcome
  updateODOutcome: async (id: string, data: { actualOutcome?: string; actualExpense?: number }) => {
    return apiRequest<any>(`/leaves/od/${id}/outcome`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete OD
  deleteOD: async (id: string) => {
    return apiRequest<any>(`/leaves/od/${id}`, { method: 'DELETE' });
  },

  // ==========================================
  // LEAVE/OD SETTINGS
  // ==========================================

  // Get leave/OD settings
  getLeaveSettings: async (type: 'leave' | 'od') => {
    return apiRequest<any>(`/leaves/settings/${type}`, { method: 'GET' });
  },

  // Save leave/OD settings
  saveLeaveSettings: async (type: 'leave' | 'od', data: any) => {
    return apiRequest<any>(`/leaves/settings/${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update leave/OD settings (alias for saveLeaveSettings)
  updateLeaveSettings: async (type: 'leave' | 'od', data: any) => {
    return apiRequest<any>(`/leaves/settings/${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get leave/OD types
  getLeaveTypes: async (type: 'leave' | 'od') => {
    return apiRequest<any>(`/leaves/types/${type}`, { method: 'GET' });
  },

  // ==========================================
  // LOAN & SALARY ADVANCE APIs
  // ==========================================

  // Get loan/salary advance settings
  getLoanSettings: async (type: 'loan' | 'salary_advance') => {
    return apiRequest<any>(`/loans/settings/${type}`, { method: 'GET' });
  },

  // Save loan/salary advance settings
  saveLoanSettings: async (type: 'loan' | 'salary_advance', data: any) => {
    return apiRequest<any>(`/loans/settings/${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update loan/salary advance settings
  updateLoanSettings: async (type: 'loan' | 'salary_advance', data: any) => {
    return apiRequest<any>(`/loans/settings/${type}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get users for workflow configuration
  getUsersForLoanWorkflow: async (type: 'loan' | 'salary_advance', role?: string) => {
    const query = role ? `?role=${role}` : '';
    return apiRequest<any>(`/loans/settings/${type}/users${query}`, { method: 'GET' });
  },

  // Get workflow configuration
  getLoanWorkflow: async (type: 'loan' | 'salary_advance') => {
    return apiRequest<any>(`/loans/settings/${type}/workflow`, { method: 'GET' });
  },

  // Update workflow configuration
  updateLoanWorkflow: async (type: 'loan' | 'salary_advance', data: any) => {
    return apiRequest<any>(`/loans/settings/${type}/workflow`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get all loans
  getLoans: async (filters?: { status?: string; employeeId?: string; department?: string; requestType?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.requestType) params.append('requestType', filters.requestType);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/loans${query}`, { method: 'GET' });
  },

  // Get my loans
  getMyLoans: async (filters?: { status?: string; requestType?: string }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.requestType) params.append('requestType', filters.requestType);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/loans/my${query}`, { method: 'GET' });
  },

  // Get single loan
  getLoan: async (id: string) => {
    return apiRequest<any>(`/loans/${id}`, { method: 'GET' });
  },

  // Apply for loan/advance
  applyLoan: async (data: any) => {
    return apiRequest<any>('/loans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update loan/advance
  updateLoan: async (id: string, data: any) => {
    return apiRequest<any>(`/loans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get pending approvals
  getPendingLoanApprovals: async () => {
    return apiRequest<any>('/loans/pending-approvals', { method: 'GET' });
  },

  // Process loan action (approve/reject/forward)
  processLoanAction: async (id: string, action: string, comments?: string) => {
    return apiRequest<any>(`/loans/${id}/action`, {
      method: 'PUT',
      body: JSON.stringify({ action, comments }),
    });
  },

  // Cancel loan
  cancelLoan: async (id: string, reason?: string) => {
    return apiRequest<any>(`/loans/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Disburse loan
  disburseLoan: async (id: string, data: { disbursementMethod?: string; transactionReference?: string; remarks?: string }) => {
    return apiRequest<any>(`/loans/${id}/disburse`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Record EMI payment
  payEMI: async (id: string, data: { amount: number; paymentDate?: string; remarks?: string; payrollCycle?: string }) => {
    return apiRequest<any>(`/loans/${id}/pay-emi`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Record advance deduction
  payAdvance: async (id: string, data: { amount: number; paymentDate?: string; remarks?: string; payrollCycle?: string }) => {
    return apiRequest<any>(`/loans/${id}/pay-advance`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get transaction history
  getLoanTransactions: async (id: string) => {
    return apiRequest<any>(`/loans/${id}/transactions`, { method: 'GET' });
  },

  // Get early settlement preview
  getSettlementPreview: async (id: string, settlementDate?: string) => {
    const query = settlementDate ? `?settlementDate=${settlementDate}` : '';
    return apiRequest<any>(`/loans/${id}/settlement-preview${query}`, { method: 'GET' });
  },

  // Add leave/OD type
  addLeaveType: async (type: 'leave' | 'od', data: any) => {
    return apiRequest<any>(`/leaves/types/${type}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get workflow
  getLeaveWorkflow: async (type: 'leave' | 'od') => {
    return apiRequest<any>(`/leaves/workflow/${type}`, { method: 'GET' });
  },

  // Update workflow
  updateLeaveWorkflow: async (type: 'leave' | 'od', workflow: any) => {
    return apiRequest<any>(`/leaves/workflow/${type}`, {
      method: 'PUT',
      body: JSON.stringify({ workflow }),
    });
  },

  // Initialize default settings
  initializeLeaveSettings: async () => {
    return apiRequest<any>('/leaves/settings/initialize', { method: 'POST' });
  },

  // Attendance
  // Monthly Summary
  getMonthlySummary: async (employeeId?: string, month?: string, year?: number, monthNumber?: number) => {
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    if (year) params.append('year', String(year));
    if (monthNumber) params.append('monthNumber', String(monthNumber));
    const query = params.toString() ? `?${params.toString()}` : '';
    const endpoint = employeeId ? `/attendance/monthly-summary/${employeeId}${query}` : `/attendance/monthly-summary${query}`;
    return apiRequest<any>(endpoint, { method: 'GET' });
  },

  calculateMonthlySummary: async (employeeId: string, year?: number, monthNumber?: number) => {
    return apiRequest<any>(`/attendance/monthly-summary/calculate/${employeeId}`, {
      method: 'POST',
      body: JSON.stringify({ year, monthNumber }),
    });
  },

  calculateAllMonthlySummaries: async (year?: number, monthNumber?: number) => {
    return apiRequest<any>('/attendance/monthly-summary/calculate-all', {
      method: 'POST',
      body: JSON.stringify({ year, monthNumber }),
    });
  },

  getAttendanceCalendar: async (employeeNumber: string, year?: number, month?: number) => {
    const params = new URLSearchParams();
    params.append('employeeNumber', employeeNumber);
    if (year) params.append('year', String(year));
    if (month) params.append('month', String(month));
    return apiRequest<any>(`/attendance/calendar?${params.toString()}`, { method: 'GET' });
  },

  getAttendanceList: async (employeeNumber: string, startDate?: string, endDate?: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    params.append('employeeNumber', employeeNumber);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    return apiRequest<any>(`/attendance/list?${params.toString()}`, { method: 'GET' });
  },

  getAttendanceDetail: async (employeeNumber: string, date: string) => {
    const params = new URLSearchParams();
    params.append('employeeNumber', employeeNumber);
    params.append('date', date);
    return apiRequest<any>(`/attendance/detail?${params.toString()}`, { method: 'GET' });
  },

  getEmployeesWithAttendance: async (date?: string) => {
    const query = date ? `?date=${date}` : '';
    return apiRequest<any>(`/attendance/employees${query}`, { method: 'GET' });
  },

  getMonthlyAttendance: async (year: number, month: number) => {
    return apiRequest<any>(`/attendance/monthly?year=${year}&month=${month}`, {
      method: 'GET',
    });
  },

  // Attendance Settings
  getAttendanceSettings: async () => {
    return apiRequest<any>('/attendance/settings', { method: 'GET' });
  },

  updateAttendanceSettings: async (data: any) => {
    return apiRequest<any>('/attendance/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Attendance Sync
  manualSyncAttendance: async (fromDate?: string, toDate?: string) => {
    return apiRequest<any>('/attendance/sync', {
      method: 'POST',
      body: JSON.stringify({ fromDate, toDate }),
    });
  },

  getAttendanceSyncStatus: async () => {
    return apiRequest<any>('/attendance/sync/status', { method: 'GET' });
  },

  // Attendance Upload
  uploadAttendanceExcel: async (file: File) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const formData = new FormData();
    formData.append('file', file);
    
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/attendance/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Upload failed');
    }
    return data;
  },

  downloadAttendanceTemplate: async () => {
    const response = await fetch(`${API_BASE_URL}/attendance/upload/template`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
    });
    if (!response.ok) throw new Error('Failed to download template');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance_template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Confused Shifts
  getConfusedShifts: async (filters?: { status?: string; startDate?: string; endDate?: string; department?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.department) params.append('department', filters.department);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/shifts/confused${query}`, { method: 'GET' });
  },

  getConfusedShift: async (id: string) => {
    return apiRequest<any>(`/shifts/confused/${id}`, { method: 'GET' });
  },

  resolveConfusedShift: async (id: string, shiftId: string, comments?: string) => {
    return apiRequest<any>(`/shifts/confused/${id}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ shiftId, comments }),
    });
  },

  dismissConfusedShift: async (id: string, comments?: string) => {
    return apiRequest<any>(`/shifts/confused/${id}/dismiss`, {
      method: 'PUT',
      body: JSON.stringify({ comments }),
    });
  },

  autoAssignConfusedShift: async (id: string) => {
    return apiRequest<any>(`/shifts/confused/${id}/auto-assign`, {
      method: 'PUT',
    });
  },

  autoAssignAllConfusedShifts: async () => {
    return apiRequest<any>('/shifts/confused/auto-assign-all', {
      method: 'PUT',
    });
  },

  getConfusedShiftStats: async () => {
    return apiRequest<any>('/shifts/confused/stats', { method: 'GET' });
  },

  // Pre-Scheduled Shifts
  getPreScheduledShifts: async (filters?: { employeeNumber?: string; startDate?: string; endDate?: string; shiftId?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.employeeNumber) params.append('employeeNumber', filters.employeeNumber);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.shiftId) params.append('shiftId', filters.shiftId);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any>(`/shifts/pre-schedule${query}`, { method: 'GET' });
  },

  createPreScheduledShift: async (data: { employeeNumber: string; shiftId: string; date: string; notes?: string }) => {
    return apiRequest<any>('/shifts/pre-schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  bulkCreatePreScheduledShifts: async (schedules: Array<{ employeeNumber: string; shiftId: string; date: string; notes?: string }>) => {
    return apiRequest<any>('/shifts/pre-schedule/bulk', {
      method: 'POST',
      body: JSON.stringify({ schedules }),
    });
  },

  updatePreScheduledShift: async (id: string, data: { shiftId?: string; notes?: string }) => {
    return apiRequest<any>(`/shifts/pre-schedule/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deletePreScheduledShift: async (id: string) => {
    return apiRequest<any>(`/shifts/pre-schedule/${id}`, { method: 'DELETE' });
  },

  // Shift Sync
  syncShifts: async (startDate?: string, endDate?: string) => {
    return apiRequest<any>('/shifts/sync', {
      method: 'POST',
      body: JSON.stringify({ startDate, endDate }),
    });
  },

  // ==========================================
  // OVERTIME (OT) APIs
  // ==========================================

  // Get OT requests
  getOTRequests: async (filters?: { employeeId?: string; employeeNumber?: string; date?: string; status?: string; startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.employeeNumber) params.append('employeeNumber', filters.employeeNumber);
    if (filters?.date) params.append('date', filters.date);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    return apiRequest<any>(`/ot?${params.toString()}`);
  },

  // Get single OT request
  getOTRequest: async (id: string) => {
    return apiRequest<any>(`/ot/${id}`);
  },

  // Create OT request
  createOT: async (data: { employeeId: string; employeeNumber: string; date: string; otOutTime: string; shiftId?: string; manuallySelectedShiftId?: string; comments?: string }) => {
    return apiRequest<any>('/ot', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Approve OT request
  approveOT: async (id: string) => {
    return apiRequest<any>(`/ot/${id}/approve`, {
      method: 'PUT',
    });
  },

  // Reject OT request
  rejectOT: async (id: string, reason?: string) => {
    return apiRequest<any>(`/ot/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Check ConfusedShift for employee date
  checkConfusedShift: async (employeeNumber: string, date: string) => {
    return apiRequest<any>(`/ot/check-confused/${employeeNumber}/${date}`);
  },

  // Convert extra hours from attendance to OT
  convertExtraHoursToOT: async (data: { employeeId: string; employeeNumber: string; date: string }) => {
    return apiRequest<any>('/ot/convert-from-attendance', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ==========================================
  // PERMISSION APIs
  // ==========================================

  // Get permission requests
  getPermissions: async (filters?: { employeeId?: string; employeeNumber?: string; date?: string; status?: string; startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.employeeId) params.append('employeeId', filters.employeeId);
    if (filters?.employeeNumber) params.append('employeeNumber', filters.employeeNumber);
    if (filters?.date) params.append('date', filters.date);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    return apiRequest<any>(`/permissions?${params.toString()}`);
  },

  // Get single permission request
  getPermission: async (id: string) => {
    return apiRequest<any>(`/permissions/${id}`);
  },

  // Create permission request
  createPermission: async (data: { employeeId: string; employeeNumber: string; date: string; permissionStartTime: string; permissionEndTime: string; purpose: string; comments?: string }) => {
    return apiRequest<any>('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Approve permission request
  approvePermission: async (id: string) => {
    return apiRequest<any>(`/permissions/${id}/approve`, {
      method: 'PUT',
    });
  },

  // Reject permission request
  rejectPermission: async (id: string, reason?: string) => {
    return apiRequest<any>(`/permissions/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    });
  },

  // Get QR code for permission
  getPermissionQR: async (id: string) => {
    return apiRequest<any>(`/permissions/${id}/qr`);
  },

  // Get outpass by QR code (public - no auth required)
  getOutpassByQR: async (qrCode: string) => {
    // Public endpoint - don't send auth token
    const url = `${API_BASE_URL}/permissions/outpass/${qrCode}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || 'An error occurred',
          error: data.error || data.message || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        ...data,
      };
    } catch (error) {
      console.error(`[API Error] GET ${url}`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error occurred',
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  },

  // Update outTime for attendance
  updateAttendanceOutTime: async (employeeNumber: string, date: string, outTime: string) => {
    return apiRequest<any>(`/attendance/${employeeNumber}/${date}/outtime`, {
      method: 'PUT',
      body: JSON.stringify({ outTime }),
    });
  },

  // Get available shifts for an employee
  getAvailableShifts: async (employeeNumber: string, date: string) => {
    return apiRequest<any>(`/attendance/${employeeNumber}/${date}/available-shifts`, {
      method: 'GET',
    });
  },

  // Assign shift to attendance record
  assignShiftToAttendance: async (employeeNumber: string, date: string, shiftId: string) => {
    return apiRequest<any>(`/attendance/${employeeNumber}/${date}/shift`, {
      method: 'PUT',
      body: JSON.stringify({ shiftId }),
    });
  },

  // Allowances & Deductions
  getAllAllowancesDeductions: async (category?: 'allowance' | 'deduction', isActive?: boolean) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (isActive !== undefined) params.append('isActive', String(isActive));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<any[]>(`/allowances-deductions${query}`, { method: 'GET' });
  },

  getAllowances: async (isActive?: boolean) => {
    const query = isActive !== undefined ? `?isActive=${isActive}` : '';
    return apiRequest<any[]>(`/allowances-deductions/allowances${query}`, { method: 'GET' });
  },

  getDeductions: async (isActive?: boolean) => {
    const query = isActive !== undefined ? `?isActive=${isActive}` : '';
    return apiRequest<any[]>(`/allowances-deductions/deductions${query}`, { method: 'GET' });
  },

  getAllowanceDeduction: async (id: string) => {
    return apiRequest<any>(`/allowances-deductions/${id}`, { method: 'GET' });
  },

  createAllowanceDeduction: async (data: {
    name: string;
    category: 'allowance' | 'deduction';
    description?: string;
    globalRule: {
      type: 'fixed' | 'percentage';
      amount?: number;
      percentage?: number;
      percentageBase?: 'basic' | 'gross';
      minAmount?: number | null;
      maxAmount?: number | null;
    };
    isActive?: boolean;
  }) => {
    return apiRequest<any>('/allowances-deductions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateAllowanceDeduction: async (id: string, data: {
    name?: string;
    description?: string;
    globalRule?: {
      type: 'fixed' | 'percentage';
      amount?: number;
      percentage?: number;
      percentageBase?: 'basic' | 'gross';
      minAmount?: number | null;
      maxAmount?: number | null;
    };
    isActive?: boolean;
  }) => {
    return apiRequest<any>(`/allowances-deductions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  addOrUpdateDepartmentRule: async (id: string, data: {
    departmentId: string;
    type: 'fixed' | 'percentage';
    amount?: number;
    percentage?: number;
    percentageBase?: 'basic' | 'gross';
    minAmount?: number | null;
    maxAmount?: number | null;
  }) => {
    return apiRequest<any>(`/allowances-deductions/${id}/department-rule`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  removeDepartmentRule: async (id: string, deptId: string) => {
    return apiRequest<void>(`/allowances-deductions/${id}/department-rule/${deptId}`, {
      method: 'DELETE',
    });
  },

  getResolvedRule: async (id: string, deptId: string) => {
    return apiRequest<any>(`/allowances-deductions/${id}/resolved/${deptId}`, { method: 'GET' });
  },

  deleteAllowanceDeduction: async (id: string) => {
    return apiRequest<void>(`/allowances-deductions/${id}`, { method: 'DELETE' });
  },

  // Overtime Settings
  getOTSettings: async () => {
    const payPerHour = await apiRequest<any>('/settings/ot_pay_per_hour', { method: 'GET' });
    const minHours = await apiRequest<any>('/settings/ot_min_hours', { method: 'GET' });
    
    return {
      success: true,
      data: {
        otPayPerHour: payPerHour.success && payPerHour.data ? payPerHour.data.value : 0,
        minOTHours: minHours.success && minHours.data ? minHours.data.value : 0,
      },
    };
  },

  updateOTSettings: async (data: { otPayPerHour: number; minOTHours: number }) => {
    const payPerHour = await apiRequest<any>('/settings', {
      method: 'POST',
      body: JSON.stringify({
        key: 'ot_pay_per_hour',
        value: data.otPayPerHour,
        description: 'Amount per hour of overtime worked (in ₹)',
        category: 'overtime',
      }),
    });
    
    const minHours = await apiRequest<any>('/settings', {
      method: 'POST',
      body: JSON.stringify({
        key: 'ot_min_hours',
        value: data.minOTHours,
        description: 'Minimum overtime hours required to be eligible for overtime pay',
        category: 'overtime',
      }),
    });
    
    return {
      success: payPerHour.success && minHours.success,
      message: payPerHour.success && minHours.success ? 'OT settings saved successfully' : 'Failed to save OT settings',
    };
  },

  // Payroll
  calculatePayroll: async (employeeId: string, month: string) => {
    return apiRequest<any>('/payroll/calculate', {
      method: 'POST',
      body: JSON.stringify({ employeeId, month }),
    });
  },

  getPayrollRecord: async (employeeId: string, month: string) => {
    return apiRequest<any>(`/payroll/${employeeId}/${month}`, { method: 'GET' });
  },

  getPayslip: async (employeeId: string, month: string) => {
    return apiRequest<any>(`/payroll/payslip/${employeeId}/${month}`, { method: 'GET' });
  },

  getPayrollRecords: async (params?: { month?: string; employeeId?: string; departmentId?: string; status?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.month) queryParams.append('month', params.month);
    if (params?.employeeId) queryParams.append('employeeId', params.employeeId);
    if (params?.departmentId) queryParams.append('departmentId', params.departmentId);
    if (params?.status) queryParams.append('status', params.status);
    const query = queryParams.toString();
    return apiRequest<any>(`/payroll${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  approvePayroll: async (payrollRecordId: string, comments?: string) => {
    return apiRequest<any>(`/payroll/${payrollRecordId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ comments }),
    });
  },

  processPayroll: async (payrollRecordId: string) => {
    return apiRequest<any>(`/payroll/${payrollRecordId}/process`, {
      method: 'PUT',
    });
  },

  recalculatePayroll: async (employeeId: string, month: string) => {
    return apiRequest<any>('/payroll/recalculate', {
      method: 'POST',
      body: JSON.stringify({ employeeId, month }),
    });
  },

  getPayrollTransactionsWithAnalytics: async (params?: { month: string; employeeId?: string; departmentId?: string }) => {
    const query = new URLSearchParams();
    if (params?.month) query.append('month', params.month);
    if (params?.employeeId) query.append('employeeId', params.employeeId);
    if (params?.departmentId) query.append('departmentId', params.departmentId);
    return apiRequest<any>(`/payroll/transactions/analytics${query.toString() ? `?${query.toString()}` : ''}`, {
      method: 'GET',
    });
  },
};

