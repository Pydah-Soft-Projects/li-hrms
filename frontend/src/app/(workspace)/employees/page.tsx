'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Department, Division, Designation } from '@/lib/api';
import { auth } from '@/lib/auth';
import BulkUpload from '@/components/BulkUpload';
import DynamicEmployeeForm from '@/components/DynamicEmployeeForm';
import Spinner from '@/components/Spinner';
import {
  EMPLOYEE_TEMPLATE_HEADERS,
  EMPLOYEE_TEMPLATE_SAMPLE,
  validateEmployeeRow,
  ParsedRow,
} from '@/lib/bulkUpload';

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  division_id?: string;
  department_id?: string;
  designation_id?: string;
  department?: { _id: string; name: string; code?: string };
  designation?: { _id: string; name: string; code?: string };
  doj?: string;
  dob?: string;
  gross_salary?: number;
  paidLeaves?: number;
  allottedLeaves?: number;
  gender?: string;
  marital_status?: string;
  blood_group?: string;
  qualifications?: any[] | string;
  experience?: number;
  address?: string;
  location?: string;
  aadhar_number?: string;
  phone_number?: string;
  alt_phone_number?: string;
  email?: string;
  pf_number?: string;
  esi_number?: string;
  bank_account_no?: string;
  bank_name?: string;
  bank_place?: string;
  ifsc_code?: string;
  is_active?: boolean;
  leftDate?: string | null;
  leftReason?: string | null;
  dynamicFields?: any;
  employeeAllowances?: any[];
  employeeDeductions?: any[];
}



interface EmployeeApplication {
  _id: string;
  emp_no: string;
  employee_name: string;
  division_id?: string | { _id: string; name: string; code?: string };
  department_id?: string | { _id: string; name: string; code?: string };
  designation_id?: string | { _id: string; name: string; code?: string };
  department?: { _id: string; name: string; code?: string };
  designation?: { _id: string; name: string; code?: string };
  proposedSalary: number;
  approvedSalary?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdBy?: { _id: string; name: string; email: string };
  approvedBy?: { _id: string; name: string; email: string };
  rejectedBy?: { _id: string; name: string; email: string };
  approvalComments?: string;
  rejectionComments?: string;
  created_at?: string;
  approvedAt?: string;
  rejectedAt?: string;
  // All other employee fields
  doj?: string;
  dob?: string;
  gender?: string;
  marital_status?: string;
  blood_group?: string;
  qualifications?: any[] | string;
  experience?: number;
  address?: string;
  location?: string;
  aadhar_number?: string;
  phone_number?: string;
  alt_phone_number?: string;
  email?: string;
  pf_number?: string;
  esi_number?: string;
  bank_account_no?: string;
  bank_name?: string;
  bank_place?: string;
  ifsc_code?: string;
  is_active?: boolean;
  employeeAllowances?: any[];
  employeeDeductions?: any[];
}

const initialFormState: Partial<Employee> = {
  emp_no: '',
  employee_name: '',
  division_id: '',
  department_id: '',
  designation_id: '',
  doj: '',
  dob: '',
  gross_salary: undefined,
  paidLeaves: 0,
  allottedLeaves: 0,
  gender: '',
  marital_status: '',
  blood_group: '',
  qualifications: [],
  experience: undefined,
  address: '',
  location: '',
  aadhar_number: '',
  phone_number: '',
  alt_phone_number: '',
  email: '',
  pf_number: '',
  esi_number: '',
  bank_account_no: '',
  bank_name: '',
  bank_place: '',
  ifsc_code: '',
  is_active: true,
  employeeAllowances: [],
  employeeDeductions: [],
};

export default function EmployeesPage() {
  const [activeTab, setActiveTab] = useState<'employees' | 'applications'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [applications, setApplications] = useState<EmployeeApplication[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [filteredDesignations, setFilteredDesignations] = useState<Designation[]>([]);
  const [filteredApplicationDesignations, setFilteredApplicationDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<EmployeeApplication | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingApplicationID, setEditingApplicationID] = useState<string | null>(null); // Track ID of application being edited
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>(initialFormState);
  const [formSettings, setFormSettings] = useState<any>(null); // To store dynamic settings for mapping
  const [applicationFormData, setApplicationFormData] = useState<Partial<EmployeeApplication & { proposedSalary: number }>>({ ...initialFormState, proposedSalary: 0 });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [approvalData, setApprovalData] = useState({ approvedSalary: 0, doj: '', comments: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dataSource, setDataSource] = useState<string>('mongodb');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [applicationSearchTerm, setApplicationSearchTerm] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [showLeftDateModal, setShowLeftDateModal] = useState(false);
  const [selectedEmployeeForLeftDate, setSelectedEmployeeForLeftDate] = useState<Employee | null>(null);
  const [leftDateForm, setLeftDateForm] = useState({ leftDate: '', leftReason: '' });
  const [includeLeftEmployees, setIncludeLeftEmployees] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'random' | 'phone_empno'>('random');
  const [notificationChannels, setNotificationChannels] = useState({ email: true, sms: true });
  const [isResending, setIsResending] = useState<string | null>(null);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);

  const [dynamicTemplate, setDynamicTemplate] = useState<{ headers: string[]; sample: any[]; columns: any[] }>({
    headers: EMPLOYEE_TEMPLATE_HEADERS,
    sample: EMPLOYEE_TEMPLATE_SAMPLE,
    columns: [],
  });

  // Allowance/Deduction defaults & overrides
  const [componentDefaults, setComponentDefaults] = useState<{ allowances: any[]; deductions: any[] }>({
    allowances: [],
    deductions: [],
  });
  const [overrideAllowances, setOverrideAllowances] = useState<Record<string, number | null>>({});
  const [overrideDeductions, setOverrideDeductions] = useState<Record<string, number | null>>({});
  const [overrideAllowancesBasedOnPresentDays, setOverrideAllowancesBasedOnPresentDays] = useState<Record<string, boolean>>({});
  const [overrideDeductionsBasedOnPresentDays, setOverrideDeductionsBasedOnPresentDays] = useState<Record<string, boolean>>({});
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [salarySummary, setSalarySummary] = useState({
    totalAllowances: 0,
    totalDeductions: 0,
    netSalary: 0,
    ctcSalary: 0,
  });
  const [applicationSalarySummary, setApplicationSalarySummary] = useState({
    totalAllowances: 0,
    totalDeductions: 0,
    netSalary: 0,
    ctcSalary: 0,
  });
  // Approval dialog allowance/deduction state
  const [approvalComponentDefaults, setApprovalComponentDefaults] = useState<{ allowances: any[]; deductions: any[] }>({
    allowances: [],
    deductions: [],
  });
  const [approvalOverrideAllowances, setApprovalOverrideAllowances] = useState<Record<string, number | null>>({});
  const [approvalOverrideDeductions, setApprovalOverrideDeductions] = useState<Record<string, number | null>>({});
  const [approvalOverrideAllowancesBasedOnPresentDays, setApprovalOverrideAllowancesBasedOnPresentDays] = useState<Record<string, boolean>>({});
  const [approvalOverrideDeductionsBasedOnPresentDays, setApprovalOverrideDeductionsBasedOnPresentDays] = useState<Record<string, boolean>>({});
  const [approvalLoadingComponents, setApprovalLoadingComponents] = useState(false);
  const [approvalSalarySummary, setApprovalSalarySummary] = useState({
    totalAllowances: 0,
    totalDeductions: 0,
    netSalary: 0,
    ctcSalary: 0,
  });

  // Build override payload: only include rows user changed (matched by masterId or name)
  const buildOverridePayload = (
    defaults: any[],
    overrides: Record<string, number | null>,
    basedOnPresentDaysMap: Record<string, boolean>,
    categoryFallback: 'allowance' | 'deduction'
  ) => {
    return defaults
      .map((item) => {
        const key = item.masterId ? item.masterId.toString() : (item.name || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const amt = overrides[key];
          const itemType = item.type || (item.base ? 'percentage' : 'fixed');
          const basedOnPresentDays = itemType === 'fixed' ? (basedOnPresentDaysMap[key] ?? item.basedOnPresentDays ?? false) : false;
          return {
            masterId: item.masterId || null,
            code: item.code || null,
            name: item.name || '',
            category: item.category || categoryFallback,
            type: itemType,
            amount: amt === null || amt === undefined ? null : Number(amt),
            overrideAmount: amt === null || amt === undefined ? null : Number(amt),
            percentage: item.type === 'percentage' ? (item.percentage ?? null) : null,
            percentageBase: item.base || item.percentageBase || null,
            minAmount: item.minAmount ?? null,
            maxAmount: item.maxAmount ?? null,
            basedOnPresentDays: basedOnPresentDays,
          };
        }
        return null;
      })
      .filter(Boolean);
  };

  // Fetch component defaults (allowances/deductions) for a dept + gross salary (+optional empNo to include existing overrides)
  const fetchComponentDefaults = async (departmentId: string, grossSalary: number, empNo?: string, preserveOverrides: boolean = false) => {
    setLoadingComponents(true);
    try {
      const res = await api.getEmployeeComponentDefaults({ departmentId, grossSalary, empNo });
      if (res?.success && res?.data) {
        const allowances = Array.isArray(res.data.allowances) ? res.data.allowances : [];
        const deductions = Array.isArray(res.data.deductions) ? res.data.deductions : [];

        // Prefill overrides map from existing employee data if editing, or preserve current overrides if preserveOverrides is true
        const newOverrideAllowances: Record<string, number | null> = preserveOverrides ? { ...overrideAllowances } : {};
        const newOverrideDeductions: Record<string, number | null> = preserveOverrides ? { ...overrideDeductions } : {};
        const newOverrideAllowancesBasedOnPresentDays: Record<string, boolean> = preserveOverrides ? { ...overrideAllowancesBasedOnPresentDays } : {};
        const newOverrideDeductionsBasedOnPresentDays: Record<string, boolean> = preserveOverrides ? { ...overrideDeductionsBasedOnPresentDays } : {};

        // If preserveOverrides is true, we keep the existing overrides (set in handleEdit)
        // If preserveOverrides is false, we load from editingEmployee if available
        if (!preserveOverrides && editingEmployee?.employeeAllowances) {
          editingEmployee.employeeAllowances.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            if (key && (ov.amount !== null && ov.amount !== undefined)) {
              newOverrideAllowances[key] = Number(ov.amount);
              newOverrideAllowancesBasedOnPresentDays[key] = ov.basedOnPresentDays ?? false;
            }
          });
        }
        if (!preserveOverrides && editingEmployee?.employeeDeductions) {
          editingEmployee.employeeDeductions.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            if (key && (ov.amount !== null && ov.amount !== undefined)) {
              newOverrideDeductions[key] = Number(ov.amount);
              newOverrideDeductionsBasedOnPresentDays[key] = ov.basedOnPresentDays ?? false;
            }
          });
        }

        setComponentDefaults({ allowances, deductions });
        setOverrideAllowances(newOverrideAllowances);
        setOverrideDeductions(newOverrideDeductions);
        setOverrideAllowancesBasedOnPresentDays(newOverrideAllowancesBasedOnPresentDays);
        setOverrideDeductionsBasedOnPresentDays(newOverrideDeductionsBasedOnPresentDays);
      } else {
        if (!preserveOverrides) {
          setComponentDefaults({ allowances: [], deductions: [] });
          setOverrideAllowances({});
          setOverrideDeductions({});
        }
      }
    } catch (err) {
      console.error('Failed to load component defaults', err);
      if (!preserveOverrides) {
        setComponentDefaults({ allowances: [], deductions: [] });
        setOverrideAllowances({});
        setOverrideDeductions({});
      }
    } finally {
      setLoadingComponents(false);
    }
  };

  // Fetch components for approval dialog
  const fetchApprovalComponentDefaults = async (departmentId: string, grossSalary: number) => {
    setApprovalLoadingComponents(true);
    try {
      const res = await api.getEmployeeComponentDefaults({ departmentId, grossSalary });
      if (res?.success && res?.data) {
        const allowances = Array.isArray(res.data.allowances) ? res.data.allowances : [];
        const deductions = Array.isArray(res.data.deductions) ? res.data.deductions : [];

        const prefAllow: Record<string, number | null> = {};
        const prefDed: Record<string, number | null> = {};
        const prefAllowBasedOnPresentDays: Record<string, boolean> = {};
        const prefDedBasedOnPresentDays: Record<string, boolean> = {};

        if (selectedApplication?.employeeAllowances) {
          selectedApplication.employeeAllowances.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            prefAllow[key] = ov.amount ?? ov.overrideAmount ?? null;
            prefAllowBasedOnPresentDays[key] = ov.basedOnPresentDays ?? false;
          });
        }
        if (selectedApplication?.employeeDeductions) {
          selectedApplication.employeeDeductions.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            prefDed[key] = ov.amount ?? ov.overrideAmount ?? null;
            prefDedBasedOnPresentDays[key] = ov.basedOnPresentDays ?? false;
          });
        }

        setApprovalComponentDefaults({ allowances, deductions });
        setApprovalOverrideAllowances(prefAllow);
        setApprovalOverrideDeductions(prefDed);
        setApprovalOverrideAllowancesBasedOnPresentDays(prefAllowBasedOnPresentDays);
        setApprovalOverrideDeductionsBasedOnPresentDays(prefDedBasedOnPresentDays);
      } else {
        setApprovalComponentDefaults({ allowances: [], deductions: [] });
        setApprovalOverrideAllowances({});
        setApprovalOverrideDeductions({});
      }
    } catch (err) {
      console.error('Failed to load component defaults (approval)', err);
      setApprovalComponentDefaults({ allowances: [], deductions: [] });
      setApprovalOverrideAllowances({});
      setApprovalOverrideDeductions({});
    } finally {
      setApprovalLoadingComponents(false);
    }
  };

  const getKey = (item: any) => (item.masterId ? item.masterId.toString() : (item.name || '').toLowerCase());

  // Recompute salary summary (frontend-only) whenever salary or overrides change
  useEffect(() => {
    // Check both gross_salary and proposedSalary (form might use either)
    const gross = Number(formData.gross_salary || (formData as any).proposedSalary || 0);

    const sumWithOverrides = (items: any[], overrides: Record<string, number | null>) =>
      items.reduce((acc, item) => {
        const key = getKey(item);
        const overrideVal = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined;
        const amount = overrideVal === null || overrideVal === undefined ? item.amount || 0 : Number(overrideVal);
        return acc + (Number.isFinite(amount) ? Number(amount) : 0);
      }, 0);

    const totalAllowances = sumWithOverrides(componentDefaults.allowances, overrideAllowances);
    const totalDeductions = sumWithOverrides(componentDefaults.deductions, overrideDeductions);
    const netSalary = gross + totalAllowances - totalDeductions;
    const ctcSalary = gross + totalAllowances; // CTC = Gross + Allowances

    setSalarySummary({
      totalAllowances,
      totalDeductions,
      netSalary,
      ctcSalary,
    });
  }, [formData.gross_salary, componentDefaults, overrideAllowances, overrideDeductions]);

  // Application salary summary based on proposed salary and overrides
  useEffect(() => {
    const gross = Number((applicationFormData as any).proposedSalary || 0);

    const sumWithOverrides = (items: any[], overrides: Record<string, number | null>) =>
      items.reduce((acc, item) => {
        const key = getKey(item);
        const overrideVal = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined;
        const amount = overrideVal === null || overrideVal === undefined ? item.amount || 0 : Number(overrideVal);
        return acc + (Number.isFinite(amount) ? Number(amount) : 0);
      }, 0);

    const totalAllowances = sumWithOverrides(componentDefaults.allowances, overrideAllowances);
    const totalDeductions = sumWithOverrides(componentDefaults.deductions, overrideDeductions);
    const netSalary = gross + totalAllowances - totalDeductions;
    const ctcSalary = gross + totalAllowances; // CTC = Gross + Allowances

    setApplicationSalarySummary({
      totalAllowances,
      totalDeductions,
      netSalary,
      ctcSalary,
    });
  }, [applicationFormData, componentDefaults, overrideAllowances, overrideDeductions]);

  // Approval salary summary
  useEffect(() => {
    const gross = Number(approvalData.approvedSalary || selectedApplication?.proposedSalary || 0);

    const sumWithOverrides = (items: any[], overrides: Record<string, number | null>) =>
      items.reduce((acc, item) => {
        const key = getKey(item);
        const overrideVal = Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : undefined;
        const amount = overrideVal === null || overrideVal === undefined ? item.amount || 0 : Number(overrideVal);
        return acc + (Number.isFinite(amount) ? Number(amount) : 0);
      }, 0);

    const totalAllowances = sumWithOverrides(approvalComponentDefaults.allowances, approvalOverrideAllowances);
    const totalDeductions = sumWithOverrides(approvalComponentDefaults.deductions, approvalOverrideDeductions);
    const netSalary = gross + totalAllowances - totalDeductions;
    const ctcSalary = gross + totalAllowances; // CTC = Gross + Allowances

    setApprovalSalarySummary({
      totalAllowances,
      totalDeductions,
      netSalary,
      ctcSalary,
    });
  }, [approvalData.approvedSalary, selectedApplication?.proposedSalary, approvalComponentDefaults, approvalOverrideAllowances, approvalOverrideDeductions]);

  const handleOverrideChange = (
    type: 'allowance' | 'deduction',
    item: any,
    value: string
  ) => {
    const parsed = value === '' ? null : Number(value);
    if (Number.isNaN(parsed as number)) return;
    const key = getKey(item);
    if (type === 'allowance') {
      setOverrideAllowances((prev) => ({ ...prev, [key]: parsed }));
    } else {
      setOverrideDeductions((prev) => ({ ...prev, [key]: parsed }));
    }
  };

  const handleApprovalOverrideChange = (
    type: 'allowance' | 'deduction',
    item: any,
    value: string
  ) => {
    const parsed = value === '' ? null : Number(value);
    if (Number.isNaN(parsed as number)) return;
    const key = getKey(item);
    if (type === 'allowance') {
      setApprovalOverrideAllowances((prev) => ({ ...prev, [key]: parsed }));
    } else {
      setApprovalOverrideDeductions((prev) => ({ ...prev, [key]: parsed }));
    }
  };

  useEffect(() => {
    const user = auth.getUser();
    if (user) {
      setUserRole(user.role);
    }
    loadEmployees();
    loadDivisions();
    loadDepartments();
    loadFormSettings();
    if (activeTab === 'applications') {
      loadApplications();
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'applications') {
      loadApplications();
    }
  }, [activeTab]);

  useEffect(() => {
    if (formData.department_id) {
      const selectedDept = departments.find(d => d._id === formData.department_id);
      if (selectedDept && selectedDept.designations) {
        // Polyfill department ID for DynamicEmployeeForm compatibility
        const validDesignations = selectedDept.designations.map((d: any) => ({
          ...d,
          department: selectedDept._id
        }));
        setFilteredDesignations(validDesignations);
      } else {
        setFilteredDesignations([]);
      }

      // Reset designation if it doesn't belong to selected department
      if (formData.designation_id && selectedDept?.designations) {
        const isValid = selectedDept.designations.find(d => d._id === formData.designation_id);
        if (!isValid) {
          setFormData(prev => ({ ...prev, designation_id: '' }));
        }
      }
    } else {
      setFilteredDesignations([]);
    }
  }, [formData.department_id, departments]);

  // Load allowance/deduction defaults when department and gross salary are set
  useEffect(() => {
    const deptId = formData.department_id;
    // Check both gross_salary and proposedSalary (form might use either)
    const gross = formData.gross_salary || (formData as any).proposedSalary;
    if (deptId && gross !== undefined && gross !== null && gross > 0) {
      // If editing and salary changed, preserve current overrides so user edits aren't lost
      const preserveOverrides = !!editingEmployee && (Object.keys(overrideAllowances).length > 0 || Object.keys(overrideDeductions).length > 0);
      fetchComponentDefaults(deptId as string, Number(gross), editingEmployee?.emp_no, preserveOverrides);
    } else {
      setComponentDefaults({ allowances: [], deductions: [] });
      setOverrideAllowances({});
      setOverrideDeductions({});
    }
  }, [formData.department_id, formData.gross_salary, (formData as any).proposedSalary, editingEmployee?.emp_no]);

  // Load allowance/deduction defaults for application dialog when dept + proposed salary are set
  useEffect(() => {
    const deptRaw = applicationFormData.department_id;
    const deptId = typeof deptRaw === 'string' ? deptRaw : deptRaw?._id;
    const gross = (applicationFormData as any).proposedSalary;
    if (deptId && gross !== undefined && gross !== null && Number(gross) > 0) {
      fetchComponentDefaults(deptId as string, Number(gross), undefined);
    }
  }, [applicationFormData.department_id, (applicationFormData as any).proposedSalary]);

  // Load allowance/deduction defaults for approval dialog when opened or salary changes
  useEffect(() => {
    if (!showApprovalDialog || !selectedApplication) return;
    const deptRaw = selectedApplication.department_id || selectedApplication.department?._id;
    const deptId = typeof deptRaw === 'string' ? deptRaw : (deptRaw as any)?._id;
    const gross = approvalData.approvedSalary || selectedApplication.proposedSalary;
    if (deptId && gross !== undefined && gross !== null && Number(gross) > 0) {
      fetchApprovalComponentDefaults(deptId as string, Number(gross));
    } else {
      setApprovalComponentDefaults({ allowances: [], deductions: [] });
      setApprovalOverrideAllowances({});
      setApprovalOverrideDeductions({});
    }
  }, [showApprovalDialog, selectedApplication, approvalData.approvedSalary]);

  useEffect(() => {
    if (applicationFormData.department_id) {
      const deptId = typeof applicationFormData.department_id === 'string'
        ? applicationFormData.department_id
        : applicationFormData.department_id._id;

      const selectedDept = departments.find(d => d._id === deptId);

      if (selectedDept && selectedDept.designations) {
        // Polyfill department ID for DynamicEmployeeForm compatibility
        const validDesignations = selectedDept.designations.map((d: any) => ({
          ...d,
          department: selectedDept._id
        }));
        setFilteredApplicationDesignations(validDesignations);
      } else {
        setFilteredApplicationDesignations([]);
      }

      // Reset designation if it doesn't belong to selected department
      if (applicationFormData.designation_id && selectedDept?.designations) {
        const desigId = typeof applicationFormData.designation_id === 'string'
          ? applicationFormData.designation_id
          : applicationFormData.designation_id._id;

        const isValid = selectedDept.designations.find((d: any) => d._id === desigId);
        if (!isValid) {
          setApplicationFormData(prev => ({ ...prev, designation_id: '' }));
        }
      }
    } else {
      setFilteredApplicationDesignations([]);
    }
  }, [applicationFormData.department_id, applicationFormData.designation_id, departments]);

  const loadFormSettings = async () => {
    try {
      const response = await api.getFormSettings();
      if (response.success && response.data) {
        setFormSettings(response.data);
        generateDynamicTemplate(response.data);
      }
    } catch (err) {
      console.error('Error loading form settings:', err);
    }
  };

  const generateDynamicTemplate = (settings: any) => {
    if (!settings || !settings.groups) return;

    const headers: string[] = [];
    const sample: any = {};
    const columns: any[] = [];

    // Permanent fields that must always be there
    const permanentFields = [
      { id: 'emp_no', label: 'Emp No', sample: 'EMP001', width: '100px' },
      { id: 'employee_name', label: 'Name', sample: 'John Doe', width: '150px' },
      { id: 'doj', label: 'Date of Joining', sample: '2024-01-01', width: '120px', type: 'date' },
      { id: 'proposedSalary', label: 'Proposed Salary', sample: 50000, width: '120px', type: 'number' },
    ];

    permanentFields.forEach(f => {
      headers.push(f.id);
      sample[f.id] = f.sample;
      columns.push({ key: f.id, label: f.label, width: f.width, type: f.type || 'text' });
    });

    // Division, Department and Designation names (for matching)
    headers.push('division_name');
    sample['division_name'] = 'Main Division';
    columns.push({ key: 'division_name', label: 'Division' });

    headers.push('department_name');
    sample['department_name'] = 'Information Technology';
    columns.push({ key: 'department_name', label: 'Department' });

    headers.push('designation_name');
    sample['designation_name'] = 'Software Developer';
    columns.push({ key: 'designation_name', label: 'Designation' });

    // Add fields from settings
    settings.groups.forEach((group: any) => {
      if (!group.isEnabled) return;
      group.fields.forEach((field: any) => {
        if (!field.isEnabled) return;

        // CRITICAL CLEANUP: Skip technical ID fields and already added permanent fields
        if (field.id.endsWith('_id') ||
          field.id === 'department' ||
          field.id === 'designation' ||
          headers.includes(field.id)) return;

        headers.push(field.id);

        // Value placeholder/sample
        if (field.type === 'date') {
          sample[field.id] = '2024-01-01';
          columns.push({ key: field.id, label: field.label, type: 'date' });
        } else if (field.type === 'number') {
          sample[field.id] = 0;
          columns.push({ key: field.id, label: field.label, type: 'number' });
        } else if (field.type === 'select' || field.type === 'multiselect') {
          sample[field.id] = field.options?.[0]?.value || '';
          columns.push({ key: field.id, label: field.label, type: 'select', options: field.options });
        } else if (field.type === 'userselect') {
          sample[field.id] = 'Employee Name';
          columns.push({ key: field.id, label: field.label, type: 'select' }); // Type select for mapping
        } else if (field.type === 'array' || field.type === 'object') {
          if (field.id === 'qualifications' || field.id === 'experience') return;
          sample[field.id] = field.type === 'array' ? 'item1, item2' : 'key1:val1|key2:val2';
          columns.push({ key: field.id, label: field.label });
        } else {
          sample[field.id] = '';
          columns.push({ key: field.id, label: field.label });
        }
      });
    });

    // Special handling for qualifications if enabled
    if (settings.qualifications?.isEnabled) {
      if (!headers.includes('qualifications')) {
        const qualFields = settings.qualifications.fields || [];
        const format = qualFields.map((f: any) => f.label || f.id).join(':');

        headers.push('qualifications');
        sample['qualifications'] = `${format}, ${format}`;
        columns.push({
          key: 'qualifications',
          label: 'Qualifications',
          width: '300px',
          tooltip: `Format: ${format} (Comma separated for multiple entries, colons for internal fields)`
        });
      }
    }

    setDynamicTemplate({
      headers,
      sample: [sample],
      columns: columns.map(c => ({ ...c, width: c.width || '150px' }))
    });
  };

  const toggleSelectApplication = (id: string) => {
    setSelectedApplicationIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    if (selectedApplicationIds.length === 0) return;

    if (!confirm(`Are you sure you want to approve ${selectedApplicationIds.length} selected applications using their proposed salaries?`)) {
      return;
    }

    try {
      setLoadingApplications(true);
      setError('');
      setSuccess('');

      // Simple bulk settings: proposed salary for all, today's DOJ
      const bulkSettings = {
        doj: new Date().toISOString().split('T')[0],
        comments: 'Bulk approved',
      };

      const response = await api.bulkApproveEmployeeApplications(selectedApplicationIds, bulkSettings);

      if (response.success) {
        setSuccess(`Bulk approval completed! Succeeded: ${response.data.successCount}, Failed: ${response.data.failCount}`);
      } else {
        setError(response.message || 'Bulk approval failed or partially failed');
        if (response.data?.successCount > 0) {
          setSuccess(`Partially completed. Succeeded: ${response.data.successCount}`);
        }
      }

      setSelectedApplicationIds([]);
      loadApplications();
      loadEmployees();
    } catch (err: any) {
      setError(err.message || 'An error occurred during bulk approval');
      console.error(err);
    } finally {
      setLoadingApplications(false);
    }
  };

  const parseDynamicField = (value: any, fieldDef: any) => {
    if (value === undefined || value === null || value === '') return undefined;

    if (fieldDef.type === 'array') {
      if (fieldDef.dataType === 'object' || fieldDef.itemType === 'object') {
        return String(value).split(',').map((item: string) => {
          const obj: any = {};
          const trimmedItem = item.trim();
          if (trimmedItem.includes('|')) {
            trimmedItem.split('|').forEach(part => {
              const [k, v] = part.split(':').map(s => s.trim());
              if (k && v) obj[k] = v;
            });
          } else if (trimmedItem.includes(':')) {
            const parts = trimmedItem.split(':').map(s => s.trim());
            // Map each part to the corresponding field in the schema
            const fields = fieldDef.itemSchema?.fields || fieldDef.fields || [];
            parts.forEach((val, idx) => {
              if (fields[idx]) {
                const key = fields[idx].label || fields[idx].id;
                obj[key] = val;
              }
            });
          } else {
            // Just a string
            const fields = fieldDef.itemSchema?.fields || fieldDef.fields || [];
            if (fields[0]) {
              const key = fields[0].label || fields[0].id;
              obj[key] = trimmedItem;
            }
          }
          return obj;
        });
      } else {
        return String(value).split(',').map((item: string) => item.trim());
      }
    }

    if (fieldDef.type === 'object') {
      const obj: any = {};
      String(value).split('|').forEach((part: string) => {
        const [k, v] = part.split(':').map((s: string) => s.trim());
        if (k && v) obj[k] = v;
      });
      return obj;
    }

    if (fieldDef.type === 'number') return Number(value);

    return value;
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.getEmployees({
        ...(includeLeftEmployees ? { includeLeft: true } : {}),
      });
      if (response.success) {
        // Ensure paidLeaves is always included and is a number
        const employeesData = (response.data || []).map((emp: any, index: number) => {
          const paidLeaves = emp.paidLeaves !== undefined && emp.paidLeaves !== null ? Number(emp.paidLeaves) : 0;
          // Debug: Log first employee to check paidLeaves and reporting_to
          if (index === 0) {
            console.log('Loading employee:', {
              emp_no: emp.emp_no,
              paidLeaves,
              original: emp.paidLeaves,
              reporting_to: emp.reporting_to,
              dynamicFields: emp.dynamicFields,
              reporting_to_in_dynamicFields: emp.dynamicFields?.reporting_to
            });
          }
          // Debug: Log any employee with reporting_to or reporting_to_
          if (emp.reporting_to || emp.reporting_to_ || emp.dynamicFields?.reporting_to || emp.dynamicFields?.reporting_to_) {
            console.log('Employee with reporting_to:', {
              emp_no: emp.emp_no,
              reporting_to_root: emp.reporting_to,
              reporting_to__root: emp.reporting_to_,
              reporting_to_dynamic: emp.dynamicFields?.reporting_to,
              reporting_to__dynamic: emp.dynamicFields?.reporting_to_,
              isArray: Array.isArray(emp.reporting_to || emp.reporting_to_ || emp.dynamicFields?.reporting_to || emp.dynamicFields?.reporting_to_),
              firstItem: (emp.reporting_to || emp.reporting_to_ || emp.dynamicFields?.reporting_to || emp.dynamicFields?.reporting_to_)?.[0]
            });
          }
          return {
            ...emp,
            paidLeaves,
          };
        });
        setEmployees(employeesData);
        setDataSource(response.dataSource || 'mongodb');
      }
    } catch (err) {
      console.error('Error loading employees:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDivisions = async () => {
    try {
      const res = await api.getDivisions(true); // Fetch only active divisions
      if (res.success) {
        setDivisions(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load divisions', err);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);

        // Flatten designations for Bulk Upload and legacy lookups
        const allDesignations: Designation[] = [];
        response.data.forEach((dept: any) => {
          if (dept.designations && Array.isArray(dept.designations)) {
            dept.designations.forEach((d: any) => {
              allDesignations.push({ ...d, department: dept._id });
            });
          }
        });
        setDesignations(allDesignations);
      }
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadApplications = async () => {
    try {
      setLoadingApplications(true);
      const response = await api.getEmployeeApplications();
      if (response.success) {
        setApplications(response.data || []);
        setSelectedApplicationIds([]); // Reset selection on reload
      }
    } catch (err) {
      console.error('Error loading applications:', err);
    } finally {
      setLoadingApplications(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const processedValue = type === 'number'
      ? (value === '' ? (name === 'paidLeaves' || name === 'allottedLeaves' ? 0 : undefined) : Number(value))
      : value;

    setFormData(prev => {
      const updated: any = {
        ...prev,
        [name]: processedValue,
      };

      // Sync gross_salary and proposedSalary so calculations work with either field
      if (name === 'gross_salary') {
        updated.proposedSalary = processedValue as number;
      } else if (name === 'proposedSalary') {
        updated.gross_salary = processedValue as number;
      }

      return updated;
    });
  };

  const handleApplicationInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    // Convert empty strings to null/undefined for enum fields
    const enumFields = ['gender', 'marital_status', 'blood_group'];
    let processedValue = value;
    if (enumFields.includes(name) && value === '') {
      processedValue = null as any;
    } else if (type === 'number') {
      processedValue = (value ? Number(value) : undefined) as any;
    }
    setApplicationFormData(prev => ({
      ...prev,
      [name]: processedValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.emp_no || !formData.employee_name) {
      setError('Employee No and Name are required');
      return;
    }

    try {
      // Clean up enum fields - convert empty strings to null/undefined
      const submitData = {
        ...formData,
        employeeAllowances: buildOverridePayload(componentDefaults.allowances, overrideAllowances, overrideAllowancesBasedOnPresentDays, 'allowance'),
        employeeDeductions: buildOverridePayload(componentDefaults.deductions, overrideDeductions, overrideDeductionsBasedOnPresentDays, 'deduction'),
        paidLeaves: formData.paidLeaves !== null && formData.paidLeaves !== undefined ? formData.paidLeaves : 0,
        allottedLeaves: formData.allottedLeaves !== null && formData.allottedLeaves !== undefined ? formData.allottedLeaves : 0,
        ctcSalary: salarySummary.ctcSalary,
        calculatedSalary: salarySummary.netSalary,
      };

      const enumFields = ['gender', 'marital_status', 'blood_group'];
      enumFields.forEach(field => {
        if ((submitData as any)[field] === '' || (submitData as any)[field] === undefined) {
          (submitData as any)[field] = null;
        }
      });
      // Convert empty strings to undefined for other optional fields
      Object.keys(submitData).forEach(key => {
        if ((submitData as any)[key] === '' && !enumFields.includes(key) && key !== 'qualifications') {
          (submitData as any)[key] = undefined;
        }
      });

      // Construct FormData for multipart/form-data submission
      const payload = new FormData();

      // Append standard fields
      Object.entries(submitData).forEach(([key, value]) => {
        if (key === 'qualifications') return; // Handle separately
        if (value === undefined || value === null) return;

        if (typeof value === 'object' && !(value instanceof Date)) {
          payload.append(key, JSON.stringify(value));
        } else {
          payload.append(key, String(value));
        }
      });

      // Handle Qualifications - Map Field IDs to Labels
      const qualities = Array.isArray(formData.qualifications) ? formData.qualifications : [];

      // Create a mapping from Field ID -> Label using formSettings
      const fieldIdToLabelMap: Record<string, string> = {};
      if (formSettings?.qualifications?.fields) {
        formSettings.qualifications.fields.forEach((f: any) => {
          fieldIdToLabelMap[f.id] = f.label;
        });
      }

      const cleanQualifications = qualities.map((q: any, index: number) => {
        const { certificateFile, ...rest } = q;

        // Transform keys from Field ID to Label (e.g. key "degree" -> "Degree")
        const transformedQ: any = {};
        Object.entries(rest).forEach(([key, val]) => {
          // If key matches a known field ID, use its label; otherwise keep key
          const label = fieldIdToLabelMap[key] || key;
          transformedQ[label] = val;
        });

        if (certificateFile instanceof File) {
          payload.append(`qualification_cert_${index}`, certificateFile);
        }
        return transformedQ;
      });
      payload.append('qualifications', JSON.stringify(cleanQualifications));

      let response;
      if (editingEmployee) {
        response = await api.updateEmployee(editingEmployee.emp_no, payload as any);
      } else {
        response = await api.createEmployee(payload as any);
      }

      if (response.success) {
        setSuccess(response.message || (editingEmployee ? 'Employee updated successfully!' : 'Employee created successfully!'));
        setShowDialog(false);
        setEditingEmployee(null);
        setFormData(initialFormState);
        setComponentDefaults({ allowances: [], deductions: [] });
        setOverrideAllowances({});
        setOverrideDeductions({});
        loadEmployees();
      } else {
        // Display validation errors if available
        const errorMsg = response.message || 'Operation failed';
        const errorDetails = (response as any).errors ? Object.values((response as any).errors).join(', ') : '';
        setError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
        console.error('Update error:', response);
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleEdit = (record: any) => {
    // Determine if we are editing an Employee or an Application based on activeTab
    if (activeTab === 'applications') {
      // --- APPLICATION EDIT LOGIC ---
      setEditingApplicationID(record._id);

      // Clone data to avoid mutation
      const appData = { ...record };

      // Reverse Map Qualification Labels -> Field IDs
      if (appData.qualifications && Array.isArray(appData.qualifications) && formSettings?.qualifications?.fields) {
        appData.qualifications = appData.qualifications.map((q: any) => {
          const newQ: any = {};
          // Preserve certificate meta
          if (q.certificateUrl) newQ.certificateUrl = q.certificateUrl;

          // Map fields
          Object.entries(q).forEach(([key, val]) => {
            if (key === 'certificateUrl') return;

            // Find field definition where label matches key
            const fieldDef = formSettings.qualifications.fields.find((f: any) => f.label === key);
            if (fieldDef) {
              newQ[fieldDef.id] = val;
            } else {
              // Keep original if no match (fallback)
              newQ[key] = val;
            }
          });
          return newQ;
        });
      }

      setApplicationFormData(appData);
      setShowApplicationDialog(true);
      return;
    }

    // --- EMPLOYEE EDIT LOGIC (Existing) ---
    const employee = record as Employee;

    // Clone employee to avoid mutation during transformation
    const empData = { ...employee };

    // Reverse Map Qualification Labels -> Field IDs (Fix for Missing Values on Edit)
    if (empData.qualifications && Array.isArray(empData.qualifications) && formSettings?.qualifications?.fields) {
      empData.qualifications = empData.qualifications.map((q: any) => {
        const newQ: any = {};
        if (q.certificateUrl) newQ.certificateUrl = q.certificateUrl;

        Object.entries(q).forEach(([key, val]) => {
          if (key === 'certificateUrl') return;
          const fieldDef = formSettings.qualifications.fields.find((f: any) => f.label === key);
          if (fieldDef) {
            newQ[fieldDef.id] = val;
          } else {
            newQ[key] = val;
          }
        });
        return newQ;
      });
    }

    setEditingEmployee(empData as Employee); // Use transform data
    setEditingApplicationID(null);

    // Extract paidLeaves
    let paidLeavesValue = 0;
    if (employee.paidLeaves !== undefined && employee.paidLeaves !== null) {
      paidLeavesValue = Number(employee.paidLeaves);
    } else if ((employee as any).paidLeaves !== undefined && (employee as any).paidLeaves !== null) {
      paidLeavesValue = Number((employee as any).paidLeaves);
    } else {
      const rawEmployee = employee as any;
      if (rawEmployee.paidLeaves !== undefined && rawEmployee.paidLeaves !== null) {
        paidLeavesValue = Number(rawEmployee.paidLeaves);
      }
    }

    // Extract allottedLeaves
    let allottedLeavesValue = 0;
    if (employee.allottedLeaves !== undefined && employee.allottedLeaves !== null) {
      allottedLeavesValue = Number(employee.allottedLeaves);
    } else if ((employee as any).allottedLeaves !== undefined && (employee as any).allottedLeaves !== null) {
      allottedLeavesValue = Number((employee as any).allottedLeaves);
    } else {
      const rawEmployee = employee as any;
      if (rawEmployee.allottedLeaves !== undefined && rawEmployee.allottedLeaves !== null) {
        allottedLeavesValue = Number(rawEmployee.allottedLeaves);
      }
    }

    // Get qualifications - check if it's an array (new format) or string (old format)
    let qualificationsValue: any[] = [];

    if (employee.qualifications) {
      if (Array.isArray(employee.qualifications)) {
        qualificationsValue = employee.qualifications.map((qual: any) => {
          const normalized: any = {};

          // Strategy: Iterate through form settings fields to find values in the stored qualification object
          if (formSettings?.qualifications?.fields) {
            formSettings.qualifications.fields.forEach((field: any) => {
              const fieldId = field.id;
              const fieldLabel = field.label;

              // Search for the value using the Label (case-insensitive) as key
              const foundKey = Object.keys(qual).find(k => k.toLowerCase() === fieldLabel.toLowerCase());
              if (foundKey) {
                normalized[fieldId] = qual[foundKey];
              } else {
                // Fallback: Check if the ID itself is used as a key
                const foundIdKey = Object.keys(qual).find(k => k.toLowerCase() === fieldId.toLowerCase());
                if (foundIdKey) {
                  normalized[fieldId] = qual[foundIdKey];
                }
              }
            });
          }

          // Always preserve certificate fields and normalize casing
          Object.keys(qual).forEach(key => {
            const lowerKey = key.toLowerCase();
            if (lowerKey === 'certificateurl') {
              normalized.certificateUrl = qual[key];
            } else if (lowerKey === 'certificatefile') {
              normalized.certificateFile = qual[key];
            }
          });

          // Fallback if no settings or empty normalized (copy everything as best effort)
          if (Object.keys(normalized).length === 0 && (!formSettings?.qualifications?.fields || formSettings.qualifications.fields.length === 0)) {
            return { ...qual };
          }

          // Ensure legacy fields (Degree/Year) are mapped if they exist and weren't caught by settings (e.g. if settings changed label)
          if (!normalized.degree && (qual.Degree || qual.degree)) normalized.degree = qual.Degree || qual.degree;
          if (!normalized.qualified_year && (qual.year || qual.Year || qual.qualified_year)) normalized.qualified_year = qual.year || qual.Year || qual.qualified_year;

          return normalized;
        });
      } else if (typeof employee.qualifications === 'string') {
        // Old format - convert to array if needed
        qualificationsValue = employee.qualifications.split(',').map(s => ({ degree: s.trim() }));
      }
    }
    // Also check in dynamicFields only if qualificationsValue is empty (to avoid overwriting valid data)
    if (qualificationsValue.length === 0 && employee.dynamicFields?.qualifications) {
      if (Array.isArray(employee.dynamicFields.qualifications)) {
        qualificationsValue = employee.dynamicFields.qualifications.map((qual: any) => {
          const normalized: any = {};

          Object.keys(qual).forEach(key => {
            const lowerKey = key.toLowerCase();

            if (lowerKey === 'degree') {
              normalized.degree = qual[key];
            } else if (lowerKey === 'year' || key === 'qualified_year') {
              normalized.qualified_year = qual[key];
            } else if (key === 'certificateUrl' || key === 'certificateFile') {
              normalized[key] = qual[key];
            } else {
              normalized[lowerKey] = qual[key];
            }
          });

          return normalized;
        });
      }
    }

    // Merge dynamicFields into formData
    const dynamicFieldsData = employee.dynamicFields || {};

    // Handle reporting_to field - extract user IDs from populated objects or use existing IDs
    let reportingToValue: string[] = [];
    const reportingToField = (employee as any).reporting_to || (employee as any).reporting_to_ || dynamicFieldsData.reporting_to || dynamicFieldsData.reporting_to_;
    if (reportingToField && Array.isArray(reportingToField)) {
      reportingToValue = reportingToField.map((item: any) => {
        // If it's a populated user object, extract the _id
        if (typeof item === 'object' && item._id) {
          return item._id;
        }
        // If it's already a string ID, use it directly
        return String(item);
      }).filter(Boolean);
    }

    // Map gross_salary to proposedSalary for the form (form uses proposedSalary field)
    const salaryValue = employee.gross_salary || dynamicFieldsData.proposedSalary || 0;

    // Create form data object - merge all fields including dynamicFields
    const newFormData: any = {
      ...employee,
      department_id: employee.department?._id || employee.department_id || '',
      designation_id: employee.designation?._id || employee.designation_id || '',
      doj: employee.doj ? new Date(employee.doj).toISOString().split('T')[0] : '',
      dob: employee.dob ? new Date(employee.dob).toISOString().split('T')[0] : '',
      paidLeaves: paidLeavesValue,
      allottedLeaves: allottedLeavesValue,
      qualifications: qualificationsValue,
      // Map gross_salary to proposedSalary for form compatibility
      proposedSalary: salaryValue,
      gross_salary: salaryValue,
      // Prefill employee overrides if present
      employeeAllowances: Array.isArray(employee.employeeAllowances) ? employee.employeeAllowances : [],
      employeeDeductions: Array.isArray(employee.employeeDeductions) ? employee.employeeDeductions : [],
      // Merge dynamicFields at root level for form
      ...dynamicFieldsData,
      // Override with processed values (after dynamicFields so they take precedence)
      reporting_to: reportingToValue,
      reporting_to_: reportingToValue,
    };

    setFormData(newFormData);
    setShowDialog(true);

    // Pre-populate override state from existing employee overrides
    if (Array.isArray(employee.employeeAllowances) && employee.employeeAllowances.length > 0) {
      const allowanceOverrides: Record<string, number | null> = {};
      const allowanceBasedOnPresentDays: Record<string, boolean> = {};
      employee.employeeAllowances.forEach((allowance: any) => {
        const key = allowance.masterId ? allowance.masterId.toString() : (allowance.name || '').toLowerCase();
        if (key && (allowance.amount !== null && allowance.amount !== undefined)) {
          allowanceOverrides[key] = Number(allowance.amount);
          allowanceBasedOnPresentDays[key] = allowance.basedOnPresentDays ?? false;
        }
      });
      setOverrideAllowances(allowanceOverrides);
      setOverrideAllowancesBasedOnPresentDays(allowanceBasedOnPresentDays);
    }

    if (Array.isArray(employee.employeeDeductions) && employee.employeeDeductions.length > 0) {
      const deductionOverrides: Record<string, number | null> = {};
      const deductionBasedOnPresentDays: Record<string, boolean> = {};
      employee.employeeDeductions.forEach((deduction: any) => {
        const key = deduction.masterId ? deduction.masterId.toString() : (deduction.name || '').toLowerCase();
        if (key && (deduction.amount !== null && deduction.amount !== undefined)) {
          deductionOverrides[key] = Number(deduction.amount);
          deductionBasedOnPresentDays[key] = deduction.basedOnPresentDays ?? false;
        }
      });
      setOverrideDeductions(deductionOverrides);
      setOverrideDeductionsBasedOnPresentDays(deductionBasedOnPresentDays);
    }

    // Trigger fetch of component defaults after a brief delay to ensure formData is set
    // This ensures recalculation happens when editing
    // Use preserveOverrides: true to keep the overrides we just set
    setTimeout(() => {
      const deptId = newFormData.department_id;
      const gross = newFormData.gross_salary;
      if (deptId && gross !== undefined && gross !== null && gross > 0) {
        fetchComponentDefaults(deptId as string, Number(gross), employee.emp_no, true);
      }
    }, 100);
  };

  const handleDeactivate = async (empNo: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this employee?`)) return;

    try {
      const response = await api.updateEmployee(empNo, { is_active: !currentStatus });
      if (response.success) {
        setSuccess(`Employee ${action}d successfully!`);
        loadEmployees();
      } else {
        setError(response.message || `Failed to ${action} employee`);
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleSetLeftDate = (employee: Employee) => {
    setSelectedEmployeeForLeftDate(employee);
    setLeftDateForm({
      leftDate: employee.leftDate ? new Date(employee.leftDate).toISOString().split('T')[0] : '',
      leftReason: employee.leftReason || '',
    });
    setShowLeftDateModal(true);
  };

  const handleSubmitLeftDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForLeftDate) return;

    if (!leftDateForm.leftDate) {
      setError('Left date is required');
      return;
    }

    try {
      setError('');
      setSuccess('');
      const response = await api.setEmployeeLeftDate(
        selectedEmployeeForLeftDate.emp_no,
        leftDateForm.leftDate,
        leftDateForm.leftReason || undefined
      );

      if (response.success) {
        setSuccess('Employee left date set successfully!');
        setShowLeftDateModal(false);
        setSelectedEmployeeForLeftDate(null);
        setLeftDateForm({ leftDate: '', leftReason: '' });
        loadEmployees();
      } else {
        setError(response.message || 'Failed to set left date');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error(err);
    }
  };

  const handleRemoveLeftDate = async (employee: Employee) => {
    if (!confirm(`Are you sure you want to reactivate ${employee.employee_name}? This will remove their left date.`)) return;

    try {
      setError('');
      setSuccess('');
      const response = await api.removeEmployeeLeftDate(employee.emp_no);

      if (response.success) {
        setSuccess('Employee reactivated successfully!');
        loadEmployees();
      } else {
        setError(response.message || 'Failed to reactivate employee');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      console.error(err);
    }
  };

  const handleViewEmployee = (employee: Employee) => {
    // Debug: Log the employee data to see what we're receiving
    console.log('Viewing employee data:', employee);
    console.log('reporting_to at root:', (employee as any).reporting_to);
    console.log('reporting_to_ at root:', (employee as any).reporting_to_);
    console.log('reporting_to in dynamicFields:', employee.dynamicFields?.reporting_to);
    console.log('reporting_to_ in dynamicFields:', employee.dynamicFields?.reporting_to_);
    setViewingEmployee(employee);
    setShowViewDialog(true);
  };

  const openCreateDialog = () => {
    setEditingEmployee(null);
    setFormData(initialFormState);
    setComponentDefaults({ allowances: [], deductions: [] });
    setOverrideAllowances({});
    setOverrideDeductions({});
    setShowDialog(true);
    setError('');
  };

  const filteredEmployees = employees.filter(emp => {
    // Filter by search term
    const matchesSearch =
      emp.emp_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.phone_number?.includes(searchTerm);

    // Filter by left employees (if includeLeftEmployees is false, exclude those with leftDate)
    const matchesLeftFilter = includeLeftEmployees || !emp.leftDate;

    // Filter by selected division
    const matchesDivision = !selectedDivision ||
      ((emp as any).division?._id === selectedDivision || emp.division_id === selectedDivision);

    return matchesSearch && matchesLeftFilter && matchesDivision;
  });

  const filteredApplications = applications.filter(app =>
    app.employee_name?.toLowerCase().includes(applicationSearchTerm.toLowerCase()) ||
    app.emp_no?.toLowerCase().includes(applicationSearchTerm.toLowerCase()) ||
    ((app.department_id as any)?.name || app.department?.name || '')?.toLowerCase().includes(applicationSearchTerm.toLowerCase())
  );

  const pendingApplications = filteredApplications.filter(app => app.status === 'pending');
  const approvedApplications = filteredApplications.filter(app => app.status === 'approved');
  const rejectedApplications = filteredApplications.filter(app => app.status === 'rejected');

  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setFormErrors({});

    try {
      // 1. Clean up enum fields & Prepare Submit Data
      console.log('Submitting Application Payload:', applicationFormData); // DEBUG
      const submitData = {
        ...applicationFormData,
        employeeAllowances: buildOverridePayload(componentDefaults.allowances, overrideAllowances, overrideAllowancesBasedOnPresentDays, 'allowance'),
        employeeDeductions: buildOverridePayload(componentDefaults.deductions, overrideDeductions, overrideDeductionsBasedOnPresentDays, 'deduction'),
        ctcSalary: applicationSalarySummary.ctcSalary,
        calculatedSalary: applicationSalarySummary.netSalary,
      };

      const enumFields = ['gender', 'marital_status', 'blood_group'];
      enumFields.forEach(field => {
        if ((submitData as any)[field] === '' || (submitData as any)[field] === undefined) {
          (submitData as any)[field] = null;
        }
      });
      // Convert empty strings to undefined for other optional fields
      Object.keys(submitData).forEach(key => {
        if ((submitData as any)[key] === '' && !enumFields.includes(key) && key !== 'qualifications') {
          (submitData as any)[key] = undefined;
        }
      });

      // 2. Construct FormData
      const payload = new FormData();

      // Append standard fields
      Object.entries(submitData).forEach(([key, value]) => {
        if (key === 'qualifications') return; // Handle separately
        if (value === undefined || value === null) return;

        if (typeof value === 'object' && !(value instanceof Date)) {
          payload.append(key, JSON.stringify(value));
        } else {
          payload.append(key, String(value));
        }
      });

      // 3. Handle Qualifications (Label Mapping & Files)
      const qualities = Array.isArray(applicationFormData.qualifications) ? applicationFormData.qualifications : [];

      // Create a mapping from Field ID -> Label using formSettings
      const fieldIdToLabelMap: Record<string, string> = {};
      if (formSettings?.qualifications?.fields) {
        formSettings.qualifications.fields.forEach((f: any) => {
          fieldIdToLabelMap[f.id] = f.label;
        });
      }

      const cleanQualifications = qualities.map((q: any, index: number) => {
        const { certificateFile, ...rest } = q;

        // Transform keys from Field ID to Label
        const transformedQ: any = {};
        Object.entries(rest).forEach(([key, val]) => {
          const label = fieldIdToLabelMap[key] || key;
          transformedQ[label] = val;
        });

        if (certificateFile instanceof File) {
          payload.append(`qualification_cert_${index}`, certificateFile);
        }
        return transformedQ;
      });
      payload.append('qualifications', JSON.stringify(cleanQualifications));

      // 4. Submit
      let response;
      if (editingApplicationID) {
        response = await api.updateEmployeeApplication(editingApplicationID, payload as any);
      } else {
        response = await api.createEmployeeApplication(payload as any);
      }

      if (response.success) {
        setSuccess(editingApplicationID ? 'Application updated successfully!' : 'Application created successfully!');
        setShowApplicationDialog(false);
        setApplicationFormData({ ...initialFormState, qualifications: [], employeeAllowances: [], employeeDeductions: [] });
        setEditingApplicationID(null);
        // Refresh list
        loadApplications();
      } else {
        // ... error handling
        const errorMsg = response.message || 'Operation failed';
        const errorDetails = (response as any).errors ? Object.values((response as any).errors).join(', ') : '';
        setError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setError('An error occurred');
    }
  };

  const handleApproveApplication = async () => {
    if (!selectedApplication) return;

    setError('');
    setSuccess('');

    if (!approvalData.approvedSalary || approvalData.approvedSalary <= 0) {
      setError('Valid approved salary is required');
      return;
    }

    if (!approvalData.doj) {
      setError('Date of Joining is required');
      return;
    }

    try {
      const response = await api.approveEmployeeApplication(selectedApplication._id, {
        approvedSalary: approvalData.approvedSalary,
        doj: approvalData.doj || undefined,
        comments: approvalData.comments,
        employeeAllowances: buildOverridePayload(approvalComponentDefaults.allowances, approvalOverrideAllowances, approvalOverrideAllowancesBasedOnPresentDays, 'allowance'),
        employeeDeductions: buildOverridePayload(approvalComponentDefaults.deductions, approvalOverrideDeductions, approvalOverrideDeductionsBasedOnPresentDays, 'deduction'),
        ctcSalary: approvalSalarySummary.ctcSalary,
        calculatedSalary: approvalSalarySummary.netSalary,
      });

      if (response.success) {
        setSuccess(response.message || 'Application approved and employee created successfully!');
        setShowApprovalDialog(false);
        setSelectedApplication(null);
        setApprovalData({ approvedSalary: 0, doj: '', comments: '' });
        loadApplications();
        loadEmployees(); // Reload employees list
      } else {
        setError(response.message || 'Failed to approve application');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleRejectApplication = async () => {
    if (!selectedApplication) return;

    setError('');
    setSuccess('');

    try {
      const response = await api.rejectEmployeeApplication(selectedApplication._id, {
        comments: approvalData.comments,
      });

      if (response.success) {
        setSuccess('Application rejected successfully!');
        setShowApprovalDialog(false);
        setSelectedApplication(null);
        setApprovalData({ approvedSalary: 0, doj: '', comments: '' });
        loadApplications();
      } else {
        setError(response.message || 'Failed to reject application');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const openApprovalDialog = (application: EmployeeApplication) => {
    setSelectedApplication(application);
    // Use application DOJ if available, otherwise default to today
    let dojValue = '';
    if (application.doj) {
      try {
        dojValue = new Date(application.doj).toISOString().split('T')[0];
      } catch (e) {
        console.error('Error parsing application DOJ:', e);
        dojValue = new Date().toISOString().split('T')[0];
      }
    } else {
      dojValue = new Date().toISOString().split('T')[0];
    }

    setApprovalData({
      approvedSalary: application.approvedSalary || application.proposedSalary,
      doj: dojValue,
      comments: '',
    });
    setApprovalComponentDefaults({ allowances: [], deductions: [] });
    setApprovalOverrideAllowances({});
    setApprovalOverrideDeductions({});
    setApprovalSalarySummary({
      totalAllowances: 0,
      totalDeductions: 0,
      netSalary: 0,
      ctcSalary: 0,
    });
    setShowApprovalDialog(true);
    setError('');
    setSuccess('');
  };

  const openApplicationDialog = () => {
    setApplicationFormData({ ...initialFormState, proposedSalary: 0 });
    setComponentDefaults({ allowances: [], deductions: [] });
    setOverrideAllowances({});
    setOverrideDeductions({});
    setApplicationSalarySummary({
      totalAllowances: 0,
      totalDeductions: 0,
      netSalary: 0,
      ctcSalary: 0,
    });
    setShowApplicationDialog(true);
    setError('');
  };

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px]">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Management</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manage employee records • Data source: <span className="font-medium text-green-600 dark:text-green-400">{dataSource.toUpperCase()}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => activeTab === 'employees' ? loadEmployees() : loadApplications()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <Link
              href="/employees/form-settings"
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Form Settings
            </Link>
            <button
              onClick={() => setShowBulkUpload(true)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="mr-2 inline h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            <button
              onClick={() => setShowApplicationDialog(true)}
              className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Application
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-6 py-3 text-sm font-semibold transition-colors ${activeTab === 'employees'
              ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Employees
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`px-6 py-3 text-sm font-semibold transition-colors ${activeTab === 'applications'
              ? 'border-b-2 border-green-500 text-green-600 dark:text-green-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Applications
            {pendingApplications.length > 0 && (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                {pendingApplications.length}
              </span>
            )}
          </button>
        </div>

        {/* Applications Tab */}
        {activeTab === 'applications' && (
          <>
            {/* Applications Header */}
            <div className="mb-6 flex items-center justify-between">
              {selectedApplicationIds.length > 0 && (userRole === 'super_admin' || userRole === 'sub_admin') && (
                <button
                  onClick={handleBulkApprove}
                  className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-500/40"
                >
                  <span>Approve Selected ({selectedApplicationIds.length})</span>
                </button>
              )}
              <input
                type="text"
                placeholder="Search applications..."
                value={applicationSearchTerm}
                onChange={(e) => setApplicationSearchTerm(e.target.value)}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Applications List */}
            {loadingApplications ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm py-16 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
                <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading applications...</p>
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-12 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-green-100 dark:from-green-900/30 dark:to-green-900/30">
                  <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No applications found</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Create a new employee application to get started</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Pending Applications */}
                {pendingApplications.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                    <div className="border-b border-slate-200 bg-gradient-to-r from-yellow-50 to-amber-50/50 px-6 py-4 dark:border-slate-700 dark:from-yellow-900/20 dark:to-amber-900/10">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending Approvals ({pendingApplications.length})</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-green-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-green-900/10">
                            <th className="px-6 py-4 text-left">
                              <input
                                type="checkbox"
                                checked={selectedApplicationIds.length === pendingApplications.length && pendingApplications.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedApplicationIds(pendingApplications.map(app => app._id));
                                  } else {
                                    setSelectedApplicationIds([]);
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800"
                              />
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Emp No</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Name</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Department</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Proposed Salary</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Created By</th>
                            <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {pendingApplications.map((app) => (
                            <tr key={app._id} className="transition-colors hover:bg-green-50/30 dark:hover:bg-green-900/10">
                              <td className="px-6 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedApplicationIds.includes(app._id)}
                                  onChange={() => toggleSelectApplication(app._id)}
                                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800"
                                />
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600 dark:text-green-400">
                                {app.emp_no}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{app.employee_name}</div>
                                {app.email && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{app.email}</div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                {(app.department_id as any)?.name || app.department?.name || '-'}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                ₹{app.proposedSalary.toLocaleString()}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                {app.createdBy?.name || '-'}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-right">
                                {(userRole === 'super_admin' || userRole === 'sub_admin') && (
                                  <button
                                    onClick={() => openApprovalDialog(app)}
                                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-green-500 hover:from-green-600 hover:to-green-600 transition-all"
                                  >
                                    Review
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Approved/Rejected Applications */}
                {(approvedApplications.length > 0 || rejectedApplications.length > 0) && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                    <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-green-50/30 px-6 py-4 dark:border-slate-700 dark:from-slate-900 dark:to-green-900/10">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Processed Applications</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-green-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-green-900/10">
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Emp No</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Name</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Proposed Salary</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Approved Salary</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Processed By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {[...approvedApplications, ...rejectedApplications].map((app) => (
                            <tr key={app._id} className="transition-colors hover:bg-green-50/30 dark:hover:bg-green-900/10">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600 dark:text-green-400">
                                {app.emp_no}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                                {app.employee_name}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                ₹{app.proposedSalary.toLocaleString()}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {app.approvedSalary ? `₹${app.approvedSalary.toLocaleString()}` : '-'}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${app.status === 'approved'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>
                                  {app.status}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                {app.approvedBy?.name || app.rejectedBy?.name || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <>
            {/* Employees Header with Search and Filter */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-1 items-center gap-3">
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 min-w-[200px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />

                {/* Division Filter */}
                <div className="min-w-[150px]">
                  <select
                    value={selectedDivision}
                    onChange={(e) => setSelectedDivision(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All Divisions</option>
                    {divisions.map((division) => (
                      <option key={division._id} value={division._id}>
                        {division.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLeftEmployees}
                    onChange={(e) => {
                      setIncludeLeftEmployees(e.target.checked);
                      loadEmployees();
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 dark:border-slate-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Include Left Employees</span>
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-900">
                  <select
                    value={passwordMode}
                    onChange={(e) => setPasswordMode(e.target.value as any)}
                    className="border-none bg-transparent px-3 py-1.5 focus:ring-0 dark:text-slate-300"
                  >
                    <option value="random">Random Pwd</option>
                    <option value="phone_empno">Last 4 Phone + EmpNo</option>
                  </select>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await api.bulkExportEmployeePasswords({ passwordMode });
                      // res is a Blob from api helper
                      const url = window.URL.createObjectURL(new Blob([res as any]));
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', 'employee_credentials.csv');
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                    } catch (err) {
                      setError('Failed to export passwords');
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Bulk Download Pwds
                </button>
              </div>
            </div>

            {/* Employee List */}
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <Spinner className="w-10 h-10" />
                <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading employees...</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white/95 p-12 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-green-100 dark:from-green-900/30 dark:to-green-900/30">
                  <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No employees found</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Add your first employee to get started</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-green-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-green-900/10">
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Emp No</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Name</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Department</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Designation</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Phone</th>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Status</th>
                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredEmployees.map((employee) => (
                        <tr
                          key={employee.emp_no}
                          className="transition-colors hover:bg-green-50/30 dark:hover:bg-green-900/10 cursor-pointer"
                          onClick={() => handleViewEmployee(employee)}
                        >
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-green-600 dark:text-green-400">
                            {employee.emp_no}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{employee.employee_name}</div>
                            {employee.email && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">{employee.email}</div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            {employee.department?.name || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            {employee.designation?.name || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            {employee.phone_number || '-'}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${employee.is_active !== false
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                {employee.is_active !== false ? 'Active' : 'Inactive'}
                              </span>
                              {employee.leftDate && (
                                <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                  Left: {new Date(employee.leftDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(employee);
                              }}
                              className="mr-2 rounded-lg p-2 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {employee.leftDate ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveLeftDate(employee);
                                }}
                                className="rounded-lg p-2 text-slate-400 transition-all hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                                title="Reactivate Employee"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetLeftDate(employee);
                                  }}
                                  className="mr-2 rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                  title="Set Left Date"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                  </svg>
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`Resend credentials to ${employee.employee_name}? This will reset their password.`)) return;
                                    setIsResending(employee.emp_no);
                                    try {
                                      const res = await api.resendEmployeeCredentials(employee.emp_no, {
                                        passwordMode,
                                        notificationChannels
                                      });
                                      if (res.success) setSuccess('Credentials sent successfully!');
                                      else setError(res.message || 'Failed to send');
                                    } catch (err) {
                                      setError('Failed to resend');
                                    } finally {
                                      setIsResending(null);
                                    }
                                  }}
                                  disabled={isResending === employee.emp_no}
                                  className="ml-2 rounded-lg p-2 text-slate-400 transition-all hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-400 disabled:opacity-50"
                                  title="Resend Credentials"
                                >
                                  {isResending === employee.emp_no ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                                  ) : (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeactivate(employee.emp_no, employee.is_active !== false);
                                  }}
                                  className={`rounded-lg p-2 transition-all ${employee.is_active !== false
                                    ? 'text-slate-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/30 dark:hover:text-orange-400'
                                    : 'text-slate-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-400'
                                    }`}
                                  title={employee.is_active !== false ? 'Deactivate' : 'Activate'}
                                >
                                  {employee.is_active !== false ? (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                  ) : (
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  )}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Showing <span className="font-medium">{filteredEmployees.length}</span> of <span className="font-medium">{employees.length}</span> employees
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Application Creation Dialog */}
      {showApplicationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApplicationDialog(false)} />
          <div className="relative z-50 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  New Employee Application
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Create an application for a new employee. Superadmin will review and approve.
                </p>
              </div>
              <button
                onClick={() => setShowApplicationDialog(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateApplication} className="space-y-6">
              <DynamicEmployeeForm
                formData={applicationFormData}
                onChange={setApplicationFormData}
                errors={formErrors}
                departments={departments}
                divisions={divisions}
                designations={filteredApplicationDesignations as any}
              />

              {/* Allowances & Deductions Overrides */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Allowances &amp; Deductions</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Defaults come from Department/Global. Enter an amount to override for this employee.
                    </p>
                  </div>
                  {loadingComponents && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">Loading components...</div>
                  )}
                </div>

                {/* Salary summary */}
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Proposed / Gross Salary</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{Number((applicationFormData as any).proposedSalary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      ₹{applicationSalarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      ₹{applicationSalarySummary.totalDeductions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Calculated / CTC</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{applicationSalarySummary.netSalary.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Allowances */}
                  <div className="rounded-xl border border-green-100 bg-green-50/70 p-3 dark:border-green-900/40 dark:bg-green-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">Allowances</h4>
                      <span className="text-xs text-green-700 dark:text-green-300">
                        {componentDefaults.allowances.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-green-700/70 dark:text-green-200/70">No allowances available.</p>
                      )}
                      {componentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = overrideAllowances[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = overrideAllowancesBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-green-100 bg-white/70 px-3 py-2 text-xs dark:border-green-900/50 dark:bg-green-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-green-900 dark:text-green-100">{item.name}</div>
                                <div className="text-[11px] text-green-700 dark:text-green-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-green-700 dark:text-green-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-green-200 bg-white px-2 py-1 text-[11px] text-green-900 focus:border-green-400 focus:outline-none dark:border-green-800 dark:bg-green-950 dark:text-green-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-green-100 dark:border-green-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setOverrideAllowancesBasedOnPresentDays({
                                        ...overrideAllowancesBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-green-300 text-green-600 focus:ring-green-500 dark:border-green-700"
                                  />
                                  <span className="text-[10px] leading-tight text-green-700 dark:text-green-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 dark:border-red-900/40 dark:bg-red-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Deductions</h4>
                      <span className="text-xs text-red-700 dark:text-red-300">
                        {componentDefaults.deductions.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-red-700/70 dark:text-red-200/70">No deductions available.</p>
                      )}
                      {componentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = overrideDeductions[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = overrideDeductionsBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-red-100 bg-white/70 px-3 py-2 text-xs dark:border-red-900/50 dark:bg-red-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-red-900 dark:text-red-100">{item.name}</div>
                                <div className="text-[11px] text-red-700 dark:text-red-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-red-700 dark:text-red-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-900 focus:border-red-400 focus:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setOverrideDeductionsBasedOnPresentDays({
                                        ...overrideDeductionsBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-red-700"
                                  />
                                  <span className="text-[10px] leading-tight text-red-700 dark:text-red-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-gradient-to-r from-green-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
                >
                  Submit Application
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplicationDialog(false)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approval Dialog with Salary Modification */}
      {showApprovalDialog && selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApprovalDialog(false)} />
          <div className="relative z-50 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Review Employee Application
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Review and approve or reject this employee application
                </p>
              </div>
              <button
                onClick={() => setShowApprovalDialog(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {/* Application Details */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Application Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Employee No</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedApplication.emp_no}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Employee Name</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedApplication.employee_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Division</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {(selectedApplication.division_id as any)?.name || (selectedApplication as any).division?.name || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Department</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {(selectedApplication.department_id as any)?.name || selectedApplication.department?.name || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Designation</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {(selectedApplication.designation_id as any)?.name || selectedApplication.designation?.name || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Created By</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{selectedApplication.createdBy?.name || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Qualifications - Key Feature */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Qualifications & Certificates</h3>
                {(() => {
                  const quals = selectedApplication.qualifications;
                  if (!quals || (Array.isArray(quals) && quals.length === 0)) {
                    return <p className="text-sm italic text-slate-500 dark:text-slate-400">No qualifications provided.</p>;
                  }

                  if (Array.isArray(quals)) {
                    return (
                      <div className="grid gap-6 sm:grid-cols-2">
                        {quals.map((qual: any, idx: number) => {
                          const certificateUrl = qual.certificateUrl;
                          const isPDF = certificateUrl?.toLowerCase().endsWith('.pdf');
                          const displayEntries = Object.entries(qual).filter(([k, v]) =>
                            k !== 'certificateUrl' && v !== null && v !== undefined && v !== ''
                          );

                          return (
                            <div key={idx} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700 flex flex-col h-full">
                              {/* Card Image Area */}
                              <div className="aspect-[3/2] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 relative group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 transition-colors">
                                {certificateUrl ? (
                                  isPDF ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <svg className="h-20 w-20 text-red-500 opacity-80 group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
                                      </svg>
                                      <span className="absolute bottom-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">PDF Document</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={certificateUrl}
                                      alt="Certificate Preview"
                                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                  )
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                                    <svg className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-xs font-medium">No Certificate</span>
                                  </div>
                                )}

                                {/* Overlay Action */}
                                {certificateUrl && (
                                  <a
                                    href={certificateUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/10 group-hover:opacity-100"
                                  >
                                    <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm hover:bg-white hover:scale-105 transition-all">
                                      View Full {isPDF ? 'Document' : 'Image'}
                                    </div>
                                  </a>
                                )}
                              </div>

                              {/* Card Content Area */}
                              <div className="flex flex-1 flex-col p-5">
                                <div className="space-y-3">
                                  {displayEntries.length > 0 ? displayEntries.map(([key, value]) => {
                                    const fieldLabel = formSettings?.qualifications?.fields?.find((f: any) => f.id === key)?.label || key.replace(/_/g, ' ');
                                    return (
                                      <div key={key} className="flex flex-col border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                          {fieldLabel}
                                        </span>
                                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1" title={String(value)}>
                                          {String(value)}
                                        </span>
                                      </div>
                                    );
                                  }) : <span className="text-sm italic text-slate-400">No Qualification Details</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return <p className="text-sm text-slate-900 dark:text-slate-100">{String(quals)}</p>;
                })()}
              </div>

              {/* Salary Section - Key Feature */}
              <div className="rounded-2xl border-2 border-green-200 bg-green-50/50 p-5 dark:border-green-800 dark:bg-green-900/20">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">Salary Approval</h3>
                <div className="space-y-4">
                  {/* Proposed Salary - Strikethrough if modified */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Proposed Salary (HR)</p>
                    <p className={`text-lg font-semibold ${approvalData.approvedSalary !== selectedApplication.proposedSalary ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      ₹{selectedApplication.proposedSalary.toLocaleString()}
                    </p>
                  </div>

                  {/* Approved Salary Input */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Approved Salary *
                    </label>
                    <input
                      type="number"
                      value={approvalData.approvedSalary || ''}
                      onChange={(e) => setApprovalData({ ...approvalData, approvedSalary: Number(e.target.value) })}
                      required
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border-2 border-green-400 bg-white px-4 py-2.5 text-lg font-semibold transition-all focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-green-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Enter approved salary"
                    />
                    {approvalData.approvedSalary !== selectedApplication.proposedSalary && (
                      <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                        ✓ Salary modified from proposed amount
                      </p>
                    )}
                  </div>

                  {/* Date of Joining */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Date of Joining *
                    </label>
                    <input
                      type="date"
                      value={approvalData.doj || ''}
                      onChange={(e) => setApprovalData({ ...approvalData, doj: e.target.value })}
                      required
                      className="w-full rounded-xl border-2 border-green-400 bg-white px-4 py-2.5 text-sm font-semibold transition-all focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-green-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Specify the employee's joining date
                    </p>
                  </div>
                </div>
              </div>

              {/* Allowances & Deductions with summary in approval */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Allowances &amp; Deductions</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Based on department/global defaults. Adjust overrides as needed before approval.
                    </p>
                  </div>
                  {approvalLoadingComponents && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">Loading components...</div>
                  )}
                </div>

                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Approved / Gross Salary</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{Number(approvalData.approvedSalary || selectedApplication.proposedSalary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      ₹{approvalSalarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      ₹{approvalSalarySummary.totalDeductions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Calculated / CTC</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{approvalSalarySummary.netSalary.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Allowances */}
                  <div className="rounded-xl border border-green-100 bg-green-50/70 p-3 dark:border-green-900/40 dark:bg-green-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">Allowances</h4>
                      <span className="text-xs text-green-700 dark:text-green-300">
                        {approvalComponentDefaults.allowances.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {approvalComponentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-green-700/70 dark:text-green-200/70">No allowances available.</p>
                      )}
                      {approvalComponentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = approvalOverrideAllowances[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = approvalOverrideAllowancesBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-green-100 bg-white/70 px-3 py-2 text-xs dark:border-green-900/50 dark:bg-green-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-green-900 dark:text-green-100">{item.name}</div>
                                <div className="text-[11px] text-green-700 dark:text-green-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-green-700 dark:text-green-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleApprovalOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-green-200 bg-white px-2 py-1 text-[11px] text-green-900 focus:border-green-400 focus:outline-none dark:border-green-800 dark:bg-green-950 dark:text-green-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-green-100 dark:border-green-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setApprovalOverrideAllowancesBasedOnPresentDays({
                                        ...approvalOverrideAllowancesBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-green-300 text-green-600 focus:ring-green-500 dark:border-green-700"
                                  />
                                  <span className="text-[10px] leading-tight text-green-700 dark:text-green-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 dark:border-red-900/40 dark:bg-red-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Deductions</h4>
                      <span className="text-xs text-red-700 dark:text-red-300">
                        {approvalComponentDefaults.deductions.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {approvalComponentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-red-700/70 dark:text-red-200/70">No deductions available.</p>
                      )}
                      {approvalComponentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = approvalOverrideDeductions[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = approvalOverrideDeductionsBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-red-100 bg-white/70 px-3 py-2 text-xs dark:border-red-900/50 dark:bg-red-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-red-900 dark:text-red-100">{item.name}</div>
                                <div className="text-[11px] text-red-700 dark:text-red-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-red-700 dark:text-red-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleApprovalOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-900 focus:border-red-400 focus:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setApprovalOverrideDeductionsBasedOnPresentDays({
                                        ...approvalOverrideDeductionsBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-red-700"
                                  />
                                  <span className="text-[10px] leading-tight text-red-700 dark:text-red-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Comments (Optional)
                </label>
                <textarea
                  value={approvalData.comments}
                  onChange={(e) => setApprovalData({ ...approvalData, comments: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
                  placeholder="Add any comments for this approval..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleApproveApplication}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-green-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
                >
                  Approve & Create Employee
                </button>
                <button
                  onClick={handleRejectApplication}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-red-500 to-red-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-red-600"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowApprovalDialog(false)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDialog(false)} />
          <div className="relative z-50 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {editingEmployee ? 'Update employee information' : 'Enter employee details below'}
                </p>
              </div>
              <button
                onClick={() => setShowDialog(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <DynamicEmployeeForm
                formData={formData}
                onChange={setFormData}
                errors={{}}
                departments={departments}
                divisions={divisions}
                designations={filteredDesignations as any}
                onSettingsLoaded={setFormSettings}
              />

              {/* Leave Settings */}
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Leave Settings</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Monthly Paid Leaves
                    </label>
                    <input
                      type="number"
                      name="paidLeaves"
                      value={formData.paidLeaves ?? 0}
                      onChange={handleInputChange}
                      min="0"
                      step="0.5"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Monthly recurring paid leaves
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Yearly Allotted Leaves
                    </label>
                    <input
                      type="number"
                      name="allottedLeaves"
                      value={formData.allottedLeaves ?? 0}
                      onChange={handleInputChange}
                      min="0"
                      step="0.5"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="0"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Yearly total for without_pay/LOP leaves (for balance tracking)
                    </p>
                  </div>
                </div>
              </div>

              {/* Allowances & Deductions Overrides + Salary Summary */}
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Allowances &amp; Deductions</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Defaults come from Department/Global. Enter an amount to override for this employee.
                    </p>
                  </div>
                  {loadingComponents && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">Loading components...</div>
                  )}
                </div>

                {/* Salary summary */}
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Gross Salary</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{Number(formData.gross_salary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      ₹{salarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                      ₹{salarySummary.totalDeductions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">CTC Salary</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{salarySummary.ctcSalary.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Calculated (Net)</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{salarySummary.netSalary.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Allowances */}
                  <div className="rounded-xl border border-green-100 bg-green-50/70 p-3 dark:border-green-900/40 dark:bg-green-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">Allowances</h4>
                      <span className="text-xs text-green-700 dark:text-green-300">
                        {componentDefaults.allowances.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-green-700/70 dark:text-green-200/70">No allowances available.</p>
                      )}
                      {componentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = overrideAllowances[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = overrideAllowancesBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-green-100 bg-white/70 px-3 py-2 text-xs dark:border-green-900/50 dark:bg-green-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-green-900 dark:text-green-100">{item.name}</div>
                                <div className="text-[11px] text-green-700 dark:text-green-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-green-700 dark:text-green-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-green-200 bg-white px-2 py-1 text-[11px] text-green-900 focus:border-green-400 focus:outline-none dark:border-green-800 dark:bg-green-950 dark:text-green-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-green-100 dark:border-green-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setOverrideAllowancesBasedOnPresentDays({
                                        ...overrideAllowancesBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-green-300 text-green-600 focus:ring-green-500 dark:border-green-700"
                                  />
                                  <span className="text-[10px] leading-tight text-green-700 dark:text-green-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 dark:border-red-900/40 dark:bg-red-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Deductions</h4>
                      <span className="text-xs text-red-700 dark:text-red-300">
                        {componentDefaults.deductions.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-red-700/70 dark:text-red-200/70">No deductions available.</p>
                      )}
                      {componentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = overrideDeductions[key] ?? item.amount ?? 0;
                        const isFixed = item.type === 'fixed';
                        const basedOnPresentDays = overrideDeductionsBasedOnPresentDays[key] ?? item.basedOnPresentDays ?? false;
                        return (
                          <div key={key} className="rounded-lg border border-red-100 bg-white/70 px-3 py-2 text-xs dark:border-red-900/50 dark:bg-red-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-red-900 dark:text-red-100">{item.name}</div>
                                <div className="text-[11px] text-red-700 dark:text-red-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-red-700 dark:text-red-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-900 focus:border-red-400 focus:outline-none dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                                />
                              </div>
                            </div>
                            {isFixed && (
                              <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/50">
                                <label className="flex items-start gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={basedOnPresentDays}
                                    onChange={(e) => {
                                      setOverrideDeductionsBasedOnPresentDays({
                                        ...overrideDeductionsBasedOnPresentDays,
                                        [key]: e.target.checked
                                      });
                                    }}
                                    className="mt-0.5 h-3 w-3 rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-red-700"
                                  />
                                  <span className="text-[10px] leading-tight text-red-700 dark:text-red-300">
                                    Prorate based on present days
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>


              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-gradient-to-r from-green-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
                >
                  {editingEmployee ? 'Update Employee' : 'Create Employee'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Dialog */}
      {showBulkUpload && (
        <BulkUpload
          title="Bulk Upload Employees"
          templateHeaders={dynamicTemplate.headers}
          templateSample={dynamicTemplate.sample}
          templateFilename="employee_template"
          columns={dynamicTemplate.columns.map(col => {
            if (col.key === 'division_name') {
              return {
                ...col,
                type: 'select',
                options: divisions.map(d => ({ value: d.name, label: d.name }))
              };
            }
            if (col.key === 'department_name') {
              return {
                ...col,
                type: 'select',
                options: (row: ParsedRow) => {
                  const rowDivName = row.division_name as string;
                  if (!rowDivName) return [];

                  const div = divisions.find(d => d.name.toLowerCase() === rowDivName.toLowerCase());
                  if (!div) return [];

                  // Filter departments that belong to this division
                  return departments
                    .filter(dept => (dept as any).divisions?.includes(div._id))
                    .map(d => ({ value: d.name, label: d.name }));
                }
              };
            }
            if (col.key === 'gender') {
              return { ...col, type: 'select', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }] };
            }
            if (col.key === 'marital_status') {
              return { ...col, type: 'select', options: [{ value: 'Single', label: 'Single' }, { value: 'Married', label: 'Married' }, { value: 'Divorced', label: 'Divorced' }, { value: 'Widowed', label: 'Widowed' }] };
            }
            if (col.key === 'blood_group') {
              return { ...col, type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => ({ value: bg, label: bg })) };
            }

            // Handle userselect fields (like reporting_to)
            const field = formSettings?.groups?.flatMap((g: any) => g.fields).find((f: any) => f.id === col.key);
            if (field?.type === 'userselect' || col.key === 'reporting_to') {
              return {
                ...col,
                type: 'select',
                options: employees.map(e => ({ value: e._id, label: e.employee_name }))
              };
            }
            return col;
          })}
          validateRow={(row) => {
            const mappedUsers = employees.map(e => ({ _id: e._id, name: e.employee_name }));
            const result = validateEmployeeRow(row, divisions, departments, designations as any, mappedUsers);
            return { isValid: result.isValid, errors: result.errors, mappedRow: result.mappedRow };
          }}
          onSubmit={async (data) => {
            const batchData: any[] = [];
            const processingErrors: string[] = [];

            data.forEach((row) => {
              try {
                // Map division, department and designation names to IDs
                const divId = divisions.find(d => d.name.toLowerCase() === (row.division_name as string)?.toLowerCase())?._id;
                const deptId = departments.find(d =>
                  d.name.toLowerCase() === (row.department_name as string)?.toLowerCase() &&
                  (!divId || (d as any).divisions?.includes(divId))
                )?._id;
                const desigId = designations.find(d =>
                  d.name.toLowerCase() === (row.designation_name as string)?.toLowerCase() &&
                  d.department === deptId
                )?._id;

                const employeeData: any = {
                  ...row,
                  division_id: divId || undefined,
                  department_id: deptId || undefined,
                  designation_id: desigId || undefined,
                  proposedSalary: row.proposedSalary || row.gross_salary || 0
                };

                // Handle dynamic fields based on form settings
                const coreFields = ['emp_no', 'employee_name', 'proposedSalary', 'gross_salary', 'division_id', 'department_id', 'designation_id', 'division_name', 'department_name', 'designation_name', 'doj', 'dob', 'gender', 'marital_status', 'blood_group', 'qualifications', 'experience', 'address', 'location', 'aadhar_number', 'phone_number', 'alt_phone_number', 'email', 'pf_number', 'esi_number', 'bank_account_no', 'bank_name', 'bank_place', 'ifsc_code'];

                if (formSettings?.groups) {
                  const dynamicFields: any = {};
                  formSettings.groups.forEach((group: any) => {
                    group.fields.forEach((field: any) => {
                      if (row[field.id] !== undefined && row[field.id] !== null && row[field.id] !== '') {
                        const val = parseDynamicField(row[field.id], field);
                        if (!coreFields.includes(field.id)) {
                          dynamicFields[field.id] = val;
                          delete employeeData[field.id];
                        } else {
                          employeeData[field.id] = val;
                        }
                      }
                    });
                  });
                  if (Object.keys(dynamicFields).length > 0) {
                    employeeData.dynamicFields = dynamicFields;
                  }
                }

                // Handle special case for qualifications if enabled
                if (formSettings?.qualifications?.isEnabled && row.qualifications) {
                  const qualDef = {
                    type: 'array',
                    itemType: 'object',
                    fields: formSettings.qualifications.fields
                  };
                  employeeData.qualifications = parseDynamicField(row.qualifications, qualDef);
                }

                batchData.push(employeeData);
              } catch (err: any) {
                processingErrors.push(`${row.emp_no || 'Row'}: Failed to process row data`);
              }
            });

            if (batchData.length === 0) {
              return { success: false, message: 'No valid data to upload' };
            }

            try {
              const response = await api.bulkCreateEmployeeApplications(batchData);
              loadApplications();
              loadEmployees();

              if (response.success) {
                return {
                  success: true,
                  message: `Successfully created ${response.data?.successCount || batchData.length} applications`
                };
              } else {
                const failCount = response.data?.failCount || 0;
                const backendErrors = response.data?.errors || [];
                const firstError = backendErrors[0]?.message || response.message;

                return {
                  success: false,
                  message: `Completed with errors. Succeeded: ${response.data?.successCount || 0}, Failed: ${failCount}. ${firstError ? 'Error: ' + firstError : ''}`
                };
              }
            } catch (err: any) {
              console.error('Bulk upload request error:', err);
              return { success: false, message: 'Failed to send bulk upload request' };
            }
          }}
          onClose={() => setShowBulkUpload(false)}
        />
      )}

      {/* Employee View Dialog */}
      {showViewDialog && viewingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowViewDialog(false)} />
          <div className="relative z-50 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {viewingEmployee.employee_name}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Employee No: {viewingEmployee.emp_no}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowViewDialog(false);
                    handleEdit(viewingEmployee);
                  }}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowViewDialog(false)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={viewingEmployee.is_active !== false
                  ? 'inline-flex rounded-full px-3 py-1 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'inline-flex rounded-full px-3 py-1 text-sm font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}>
                  {viewingEmployee.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Basic Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Basic Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Employee Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.emp_no || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Name</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.employee_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Department</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.department?.name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Designation</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.designation?.name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Date of Joining</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.doj ? new Date(viewingEmployee.doj).toLocaleDateString() : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Date of Birth</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.dob ? new Date(viewingEmployee.dob).toLocaleDateString() : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Gross Salary</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.gross_salary ? `₹${viewingEmployee.gross_salary.toLocaleString()}` : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">CTC Salary</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{(viewingEmployee as any).ctcSalary ? `₹${(viewingEmployee as any).ctcSalary.toLocaleString()}` : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Calculated Salary (Net)</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{(viewingEmployee as any).calculatedSalary ? `₹${(viewingEmployee as any).calculatedSalary.toLocaleString()}` : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Paid Leaves</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.paidLeaves ?? '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Gender</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.gender || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Marital Status</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.marital_status || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Blood Group</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.blood_group || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Contact Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Phone Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.phone_number || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Alternate Phone</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.alt_phone_number || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.email || '-'}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Address</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.address || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Location</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.location || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Professional Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">Qualifications</label>
                    <div className="space-y-3">
                      {(() => {
                        const quals = viewingEmployee.qualifications;
                        if (!quals || (Array.isArray(quals) && quals.length === 0)) {
                          return <p className="text-sm font-medium text-slate-900 dark:text-slate-100">-</p>;
                        }

                        // Handle array of objects (new format)
                        if (Array.isArray(quals)) {
                          return (
                            <div className="grid gap-6 sm:grid-cols-2">
                              {quals.map((qual: any, idx: number) => {
                                const certificateUrl = qual.certificateUrl;
                                const isPDF = certificateUrl?.toLowerCase().endsWith('.pdf');
                                // Filter out internal keys like certificateUrl for list display
                                const displayEntries = Object.entries(qual).filter(([k, v]) =>
                                  k !== 'certificateUrl' && v !== null && v !== undefined && v !== ''
                                );

                                return (
                                  <div key={idx} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:border-blue-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700 flex flex-col h-full">
                                    {/* Card Image Area */}
                                    <div className="aspect-[3/2] w-full overflow-hidden bg-slate-100 dark:bg-slate-800 relative group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80 transition-colors">
                                      {certificateUrl ? (
                                        isPDF ? (
                                          <div className="absolute inset-0 flex items-center justify-center">
                                            <svg className="h-20 w-20 text-red-500 opacity-80 group-hover:scale-110 transition-transform duration-300" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
                                            </svg>
                                            <span className="absolute bottom-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">PDF Document</span>
                                          </div>
                                        ) : (
                                          <img
                                            src={certificateUrl}
                                            alt="Certificate Preview"
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                          />
                                        )
                                      ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                                          <svg className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                          </svg>
                                          <span className="text-xs font-medium">No Certificate</span>
                                        </div>
                                      )}

                                      {/* Overlay Action */}
                                      {certificateUrl && (
                                        <a
                                          href={certificateUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/10 group-hover:opacity-100"
                                        >
                                          <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm hover:bg-white hover:scale-105 transition-all">
                                            View Full {isPDF ? 'Document' : 'Image'}
                                          </div>
                                        </a>
                                      )}
                                    </div>

                                    {/* Card Content Area */}
                                    <div className="flex flex-1 flex-col p-5">
                                      <div className="space-y-3">
                                        {displayEntries.length > 0 ? displayEntries.map(([key, value]) => {
                                          const fieldLabel = formSettings?.qualifications?.fields?.find((f: any) => f.id === key)?.label || key.replace(/_/g, ' ');
                                          return (
                                            <div key={key} className="flex flex-col border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
                                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
                                                {fieldLabel}
                                              </span>
                                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-1" title={String(value)}>
                                                {String(value)}
                                              </span>
                                            </div>
                                          );
                                        }) : <span className="text-sm italic text-slate-400">No Qualification Details</span>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        // Fallback for string
                        return <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{String(quals)}</p>;
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Experience (Years)</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.experience ?? '-'}</p>
                  </div>
                </div>
              </div>

              {/* Financial Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Financial Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">PF Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.pf_number || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">ESI Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.esi_number || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Aadhar Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.aadhar_number || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Bank Details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Account Number</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.bank_account_no || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank Name</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.bank_name || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Bank Place</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.bank_place || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">IFSC Code</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.ifsc_code || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Allowances & Deductions - Always show this section */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Allowances & Deductions</h3>

                {/* Allowances */}
                {viewingEmployee.employeeAllowances && viewingEmployee.employeeAllowances.length > 0 ? (
                  <div className="mb-6">
                    <h4 className="mb-3 text-sm font-semibold text-green-700 dark:text-green-400">Allowances</h4>
                    <div className="space-y-2">
                      {viewingEmployee.employeeAllowances.map((allowance: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-900/20">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{allowance.name || '-'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {allowance.type === 'percentage'
                                ? `${allowance.percentage}% of ${allowance.percentageBase || 'basic'}`
                                : 'Fixed Amount'}
                              {allowance.isOverride && (
                                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Override
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                            {allowance.amount !== null && allowance.amount !== undefined
                              ? `₹${Number(allowance.amount).toLocaleString()}`
                              : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No employee-level allowance overrides. Default allowances from Department/Global settings will be used during payroll calculation.
                    </p>
                  </div>
                )}

                {/* Deductions */}
                {viewingEmployee.employeeDeductions && viewingEmployee.employeeDeductions.length > 0 ? (
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">Deductions</h4>
                    <div className="space-y-2">
                      {viewingEmployee.employeeDeductions.map((deduction: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-900/20">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{deduction.name || '-'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {deduction.type === 'percentage'
                                ? `${deduction.percentage}% of ${deduction.percentageBase || 'basic'}`
                                : 'Fixed Amount'}
                              {deduction.isOverride && (
                                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Override
                                </span>
                              )}
                            </p>
                          </div>
                          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                            {deduction.amount !== null && deduction.amount !== undefined
                              ? `₹${Number(deduction.amount).toLocaleString()}`
                              : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No employee-level deduction overrides. Default deductions from Department/Global settings will be used during payroll calculation.
                    </p>
                  </div>
                )}
              </div>

              {/* Left Date Information */}
              {viewingEmployee.leftDate && (
                <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5 dark:border-orange-800 dark:bg-orange-900/20 mb-5">
                  <h3 className="mb-4 text-lg font-semibold text-orange-900 dark:text-orange-100">Left Date Information</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Left Date</label>
                      <p className="mt-1 text-sm font-medium text-orange-900 dark:text-orange-100">
                        {new Date(viewingEmployee.leftDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    {viewingEmployee.leftReason && (
                      <div>
                        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Reason</label>
                        <p className="mt-1 text-sm font-medium text-orange-900 dark:text-orange-100">
                          {viewingEmployee.leftReason}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => {
                        setShowViewDialog(false);
                        handleRemoveLeftDate(viewingEmployee);
                      }}
                      className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
                    >
                      Reactivate Employee
                    </button>
                  </div>
                </div>
              )}

              {/* Leave Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Leave Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monthly Paid Leaves</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {viewingEmployee.paidLeaves !== undefined && viewingEmployee.paidLeaves !== null
                        ? `${viewingEmployee.paidLeaves} days/month`
                        : '0 days/month'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Recurring monthly paid leaves
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Yearly Allotted Leaves</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {viewingEmployee.allottedLeaves !== undefined && viewingEmployee.allottedLeaves !== null
                        ? `${viewingEmployee.allottedLeaves} days/year`
                        : '0 days/year'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Total for without_pay/LOP leaves (for balance tracking)
                    </p>
                  </div>
                  {((viewingEmployee as any).ctcSalary !== undefined && (viewingEmployee as any).ctcSalary !== null) && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">CTC Salary</label>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        ₹{Number((viewingEmployee as any).ctcSalary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                  {((viewingEmployee as any).calculatedSalary !== undefined && (viewingEmployee as any).calculatedSalary !== null) && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Calculated Salary (Net)</label>
                      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                        ₹{Number((viewingEmployee as any).calculatedSalary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reporting Authority Section - Check both root and dynamicFields, handle both reporting_to and reporting_to_ */}
              {((viewingEmployee as any).reporting_to || (viewingEmployee as any).reporting_to_ || viewingEmployee.dynamicFields?.reporting_to || viewingEmployee.dynamicFields?.reporting_to_) && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Reporting Authority</h3>
                  {(() => {
                    const reportingTo = (viewingEmployee as any).reporting_to || (viewingEmployee as any).reporting_to_ || viewingEmployee.dynamicFields?.reporting_to || viewingEmployee.dynamicFields?.reporting_to_;
                    console.log('Displaying reporting_to:', reportingTo);

                    if (!reportingTo || !Array.isArray(reportingTo) || reportingTo.length === 0) {
                      return <p className="text-sm text-slate-500 dark:text-slate-400">No reporting managers assigned</p>;
                    }

                    const isPopulated = reportingTo[0] && typeof reportingTo[0] === 'object' && reportingTo[0].name;
                    console.log('Is populated:', isPopulated, 'First item:', reportingTo[0]);

                    return (
                      <div className="space-y-2">
                        {isPopulated ? (
                          reportingTo.map((user: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.name || 'Unknown'}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{user.email || ''}</p>
                              </div>
                              {user.role && (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  {user.role}
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          // Fallback if not populated (show IDs)
                          reportingTo.map((id: any, idx: number) => (
                            <div key={idx} className="text-sm text-slate-600 dark:text-slate-400">
                              {typeof id === 'object' ? id._id || JSON.stringify(id) : id}
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Dynamic Fields */}
              {viewingEmployee.dynamicFields && Object.keys(viewingEmployee.dynamicFields).length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Additional Information</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(viewingEmployee.dynamicFields)
                      .filter(([key]) => key !== 'reporting_to' && key !== 'reporting_to_' && key !== 'qualifications')
                      .map(([key, value]) => {
                        if (value === null || value === undefined || value === '') {
                          return null;
                        }
                        const underscoreRegex = new RegExp('_', 'g');
                        const wordBoundaryRegex = new RegExp('\\b\\w', 'g');
                        const displayKey = key.replace(underscoreRegex, ' ').replace(wordBoundaryRegex, (l: string) => l.toUpperCase());

                        let displayValue: string = '';
                        if (Array.isArray(value)) {
                          displayValue = value.length > 0 ? JSON.stringify(value) : '-';
                        } else if (typeof value === 'object') {
                          displayValue = JSON.stringify(value, null, 2);
                        } else {
                          displayValue = String(value);
                        }

                        const isComplexType = Array.isArray(value) || typeof value === 'object';
                        const colSpanClass = isComplexType ? 'sm:col-span-2 lg:col-span-3' : '';
                        const whitespaceClass = isComplexType ? 'whitespace-pre-wrap' : '';
                        const paragraphClassName = 'mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 ' + whitespaceClass;

                        return (
                          <div key={key} className={colSpanClass}>
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{displayKey}</label>
                            <p className={paragraphClassName}>
                              {displayValue}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Left Date Modal */}
      {showLeftDateModal && selectedEmployeeForLeftDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLeftDateModal(false)} />
          <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Set Employee Left Date
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {selectedEmployeeForLeftDate.employee_name} ({selectedEmployeeForLeftDate.emp_no})
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLeftDateModal(false);
                  setSelectedEmployeeForLeftDate(null);
                  setLeftDateForm({ leftDate: '', leftReason: '' });
                }}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmitLeftDate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Left Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={leftDateForm.leftDate}
                  onChange={(e) => setLeftDateForm({ ...leftDateForm, leftDate: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  The employee will be included in pay register for this month, but excluded from future months.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reason for Leaving (Optional)
                </label>
                <textarea
                  value={leftDateForm.leftReason}
                  onChange={(e) => setLeftDateForm({ ...leftDateForm, leftReason: e.target.value })}
                  rows={3}
                  placeholder="Enter reason for leaving..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowLeftDateModal(false);
                    setSelectedEmployeeForLeftDate(null);
                    setLeftDateForm({ leftDate: '', leftReason: '' });
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-orange-600"
                >
                  Set Left Date
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

