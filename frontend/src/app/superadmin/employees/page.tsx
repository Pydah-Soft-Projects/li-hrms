'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import BulkUpload from '@/components/BulkUpload';
import DynamicEmployeeForm from '@/components/DynamicEmployeeForm';
import {
  EMPLOYEE_TEMPLATE_HEADERS,
  EMPLOYEE_TEMPLATE_SAMPLE,
  validateEmployeeRow,
  ParsedRow,
} from '@/lib/bulkUpload';

interface Employee {
  emp_no: string;
  employee_name: string;
  department_id?: string;
  designation_id?: string;
  department?: { _id: string; name: string; code?: string };
  designation?: { _id: string; name: string; code?: string };
  doj?: string;
  dob?: string;
  gross_salary?: number;
  paidLeaves?: number;
  gender?: string;
  marital_status?: string;
  blood_group?: string;
  qualifications?: string;
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
  dynamicFields?: any;
  employeeAllowances?: any[];
  employeeDeductions?: any[];
}

interface Department {
  _id: string;
  name: string;
  code?: string;
}

interface Designation {
  _id: string;
  name: string;
  code?: string;
  department: string;
}

interface EmployeeApplication {
  _id: string;
  emp_no: string;
  employee_name: string;
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
  qualifications?: string;
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
}

const initialFormState: Partial<Employee> = {
  emp_no: '',
  employee_name: '',
  department_id: '',
  designation_id: '',
  doj: '',
  dob: '',
  gross_salary: undefined,
  paidLeaves: 0,
  gender: '',
  marital_status: '',
  blood_group: '',
  qualifications: '',
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
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [formData, setFormData] = useState<Partial<Employee>>(initialFormState);
  const [applicationFormData, setApplicationFormData] = useState<Partial<EmployeeApplication & { proposedSalary: number }>>({ ...initialFormState, proposedSalary: 0 });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [approvalData, setApprovalData] = useState({ approvedSalary: 0, doj: '', comments: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dataSource, setDataSource] = useState<string>('mongodb');
  const [searchTerm, setSearchTerm] = useState('');
  const [applicationSearchTerm, setApplicationSearchTerm] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Allowance/Deduction defaults & overrides
  const [componentDefaults, setComponentDefaults] = useState<{ allowances: any[]; deductions: any[] }>({
    allowances: [],
    deductions: [],
  });
  const [overrideAllowances, setOverrideAllowances] = useState<Record<string, number | null>>({});
  const [overrideDeductions, setOverrideDeductions] = useState<Record<string, number | null>>({});
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
  const [approvalLoadingComponents, setApprovalLoadingComponents] = useState(false);
  const [approvalSalarySummary, setApprovalSalarySummary] = useState({
    totalAllowances: 0,
    totalDeductions: 0,
    netSalary: 0,
    ctcSalary: 0,
  });

  // Build override payload: only include rows user changed (matched by masterId or name)
  const buildOverridePayload = (defaults: any[], overrides: Record<string, number | null>, categoryFallback: 'allowance' | 'deduction') => {
    return defaults
      .map((item) => {
        const key = item.masterId ? item.masterId.toString() : (item.name || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          const amt = overrides[key];
          return {
            masterId: item.masterId || null,
            code: item.code || null,
            name: item.name || '',
            category: item.category || categoryFallback,
            type: item.type || (item.base ? 'percentage' : 'fixed'),
            amount: amt === null || amt === undefined ? null : Number(amt),
            overrideAmount: amt === null || amt === undefined ? null : Number(amt),
            percentage: item.type === 'percentage' ? (item.percentage ?? null) : null,
            percentageBase: item.base || item.percentageBase || null,
            minAmount: item.minAmount ?? null,
            maxAmount: item.maxAmount ?? null,
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

        // If preserveOverrides is true, we keep the existing overrides (set in handleEdit)
        // If preserveOverrides is false, we load from editingEmployee if available
        if (!preserveOverrides && editingEmployee?.employeeAllowances) {
          editingEmployee.employeeAllowances.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            if (key && (ov.amount !== null && ov.amount !== undefined)) {
              newOverrideAllowances[key] = Number(ov.amount);
            }
          });
        }
        if (!preserveOverrides && editingEmployee?.employeeDeductions) {
          editingEmployee.employeeDeductions.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            if (key && (ov.amount !== null && ov.amount !== undefined)) {
              newOverrideDeductions[key] = Number(ov.amount);
            }
          });
        }

        setComponentDefaults({ allowances, deductions });
        setOverrideAllowances(newOverrideAllowances);
        setOverrideDeductions(newOverrideDeductions);
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

        if (selectedApplication?.employeeAllowances) {
          selectedApplication.employeeAllowances.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            prefAllow[key] = ov.amount ?? ov.overrideAmount ?? null;
          });
        }
        if (selectedApplication?.employeeDeductions) {
          selectedApplication.employeeDeductions.forEach((ov: any) => {
            const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
            prefDed[key] = ov.amount ?? ov.overrideAmount ?? null;
          });
        }

        setApprovalComponentDefaults({ allowances, deductions });
        setApprovalOverrideAllowances(prefAllow);
        setApprovalOverrideDeductions(prefDed);
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
    loadDepartments();
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
      const filtered = designations.filter(d => d.department === formData.department_id);
      setFilteredDesignations(filtered);
      // Reset designation if it doesn't belong to selected department
      if (formData.designation_id && !filtered.find(d => d._id === formData.designation_id)) {
        setFormData(prev => ({ ...prev, designation_id: '' }));
      }
    } else {
      setFilteredDesignations([]);
    }
  }, [formData.department_id, designations]);

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
      const filtered = designations.filter(d => d.department === deptId);
      setFilteredApplicationDesignations(filtered);
      // Reset designation if it doesn't belong to selected department
      if (applicationFormData.designation_id) {
        const desigId = typeof applicationFormData.designation_id === 'string' 
          ? applicationFormData.designation_id 
          : applicationFormData.designation_id._id;
        if (!filtered.find(d => d._id === desigId)) {
        setApplicationFormData(prev => ({ ...prev, designation_id: '' }));
        }
      }
    } else {
      setFilteredApplicationDesignations([]);
    }
  }, [applicationFormData.department_id, applicationFormData.designation_id, designations]);

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await api.getEmployees();
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

  const loadDepartments = async () => {
    try {
      const response = await api.getDepartments(true);
      if (response.success && response.data) {
        setDepartments(response.data);
        // Load all designations
        const allDesignations: Designation[] = [];
        for (const dept of response.data) {
          const desigRes = await api.getDesignations(dept._id);
          if (desigRes.success && desigRes.data) {
            allDesignations.push(...desigRes.data.map((d: any) => ({ ...d, department: dept._id })));
          }
        }
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
      ? (value === '' ? (name === 'paidLeaves' ? 0 : undefined) : Number(value))
      : value;
    
    setFormData(prev => {
      const updated = {
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
      // Ensure paidLeaves is always sent (even if 0)
      const submitData = {
        ...formData,
        employeeAllowances: buildOverridePayload(componentDefaults.allowances, overrideAllowances, 'allowance'),
        employeeDeductions: buildOverridePayload(componentDefaults.deductions, overrideDeductions, 'deduction'),
        paidLeaves: formData.paidLeaves !== null && formData.paidLeaves !== undefined ? formData.paidLeaves : 0,
        ctcSalary: salarySummary.ctcSalary,
        calculatedSalary: salarySummary.netSalary,
      };
      
      let response;
      if (editingEmployee) {
        response = await api.updateEmployee(editingEmployee.emp_no, submitData);
      } else {
        response = await api.createEmployee(submitData);
      }

      if (response.success) {
        setSuccess(editingEmployee ? 'Employee updated successfully!' : 'Employee created successfully!');
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
        const errorDetails = response.errors ? Object.values(response.errors).join(', ') : '';
        setError(errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg);
        console.error('Update error:', response);
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    
    // Extract paidLeaves - check multiple possible locations
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
    
    // Get qualifications - check if it's an array (new format) or string (old format)
    let qualificationsValue: any[] = [];
    if (employee.qualifications) {
      if (Array.isArray(employee.qualifications)) {
        qualificationsValue = employee.qualifications;
      } else if (typeof employee.qualifications === 'string') {
        // Old format - convert to array if needed
        qualificationsValue = [];
      }
    }
    // Also check in dynamicFields
    if (employee.dynamicFields?.qualifications) {
      if (Array.isArray(employee.dynamicFields.qualifications)) {
        qualificationsValue = employee.dynamicFields.qualifications;
      }
    }
    
    // Merge dynamicFields into formData
    const dynamicFieldsData = employee.dynamicFields || {};
    
    // Handle reporting_to field - extract user IDs from populated objects or use existing IDs
    let reportingToValue: string[] = [];
    const reportingToField = employee.reporting_to || employee.reporting_to_ || dynamicFieldsData.reporting_to || dynamicFieldsData.reporting_to_;
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
      qualifications: qualificationsValue,
      // Map gross_salary to proposedSalary for form compatibility
      proposedSalary: salaryValue,
      gross_salary: salaryValue,
      // Prefill employee overrides if present
      employeeAllowances: Array.isArray(employee.employeeAllowances) ? employee.employeeAllowances : [],
      employeeDeductions: Array.isArray(employee.employeeDeductions) ? employee.employeeDeductions : [],
      // Handle reporting_to - use the extracted IDs
      reporting_to: reportingToValue,
      reporting_to_: reportingToValue, // Also set the underscore version for compatibility
      // Merge dynamicFields at root level for form (but override with processed values above)
      ...dynamicFieldsData,
      // Override with processed values
      reporting_to: reportingToValue,
      reporting_to_: reportingToValue,
    };
    
    setFormData(newFormData);
    setShowDialog(true);
    
    // Pre-populate override state from existing employee overrides
    if (Array.isArray(employee.employeeAllowances) && employee.employeeAllowances.length > 0) {
      const allowanceOverrides: Record<string, number | null> = {};
      employee.employeeAllowances.forEach((allowance: any) => {
        const key = allowance.masterId ? allowance.masterId.toString() : (allowance.name || '').toLowerCase();
        if (key && (allowance.amount !== null && allowance.amount !== undefined)) {
          allowanceOverrides[key] = Number(allowance.amount);
        }
      });
      setOverrideAllowances(allowanceOverrides);
    }
    
    if (Array.isArray(employee.employeeDeductions) && employee.employeeDeductions.length > 0) {
      const deductionOverrides: Record<string, number | null> = {};
      employee.employeeDeductions.forEach((deduction: any) => {
        const key = deduction.masterId ? deduction.masterId.toString() : (deduction.name || '').toLowerCase();
        if (key && (deduction.amount !== null && deduction.amount !== undefined)) {
          deductionOverrides[key] = Number(deduction.amount);
        }
      });
      setOverrideDeductions(deductionOverrides);
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

  const handleViewEmployee = (employee: Employee) => {
    // Debug: Log the employee data to see what we're receiving
    console.log('Viewing employee data:', employee);
    console.log('reporting_to at root:', employee.reporting_to);
    console.log('reporting_to_ at root:', employee.reporting_to_);
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

  const filteredEmployees = employees.filter(emp =>
    emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.emp_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.department?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      // Clean up enum fields - convert empty strings to null/undefined
      const cleanedData: any = { ...applicationFormData };
      const enumFields = ['gender', 'marital_status', 'blood_group'];
      enumFields.forEach(field => {
        if (cleanedData[field] === '' || cleanedData[field] === undefined) {
          cleanedData[field] = null;
        }
      });
      // Convert empty strings to undefined for other optional fields
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key] === '' && !enumFields.includes(key)) {
          cleanedData[key] = undefined;
        }
      });

      // Normalize qualifications for backend (expects string)
      const qualificationsPayload = Array.isArray(applicationFormData.qualifications)
        ? JSON.stringify(applicationFormData.qualifications)
        : applicationFormData.qualifications;

      const response = await api.createEmployeeApplication({
        ...cleanedData,
        proposedSalary: applicationFormData.proposedSalary,
        qualifications: qualificationsPayload,
        employeeAllowances: buildOverridePayload(componentDefaults.allowances, overrideAllowances, 'allowance'),
        employeeDeductions: buildOverridePayload(componentDefaults.deductions, overrideDeductions, 'deduction'),
        ctcSalary: applicationSalarySummary.ctcSalary,
        calculatedSalary: applicationSalarySummary.netSalary,
      });

      if (response.success) {
        setSuccess('Employee application created successfully!');
        setShowApplicationDialog(false);
        setApplicationFormData({ ...initialFormState, proposedSalary: 0 });
        setFormErrors({});
        loadApplications();
      } else {
        // Handle validation errors
        if (response.errors) {
          setFormErrors(response.errors);
          setError('Please fix the errors below');
      } else {
        setError(response.message || 'Failed to create application');
        }
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
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
        employeeAllowances: buildOverridePayload(approvalComponentDefaults.allowances, approvalOverrideAllowances, 'allowance'),
        employeeDeductions: buildOverridePayload(approvalComponentDefaults.deductions, approvalOverrideDeductions, 'deduction'),
        ctcSalary: approvalSalarySummary.ctcSalary,
        calculatedSalary: approvalSalarySummary.netSalary,
      });

      if (response.success) {
        setSuccess('Application approved and employee created successfully!');
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
    // Default DOJ to today's date if not provided
    const today = new Date().toISOString().split('T')[0];
    setApprovalData({
      approvedSalary: application.approvedSalary || application.proposedSalary,
      doj: today,
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
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-emerald-50/40 via-teal-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px]">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Employee Management</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Manage employee records • Data source: <span className="font-medium text-emerald-600 dark:text-emerald-400">{dataSource.toUpperCase()}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/superadmin/employees/form-settings"
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
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            <button
              onClick={openCreateDialog}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Employee
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
            className={`px-6 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'employees'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            Employees
          </button>
          <button
            onClick={() => setActiveTab('applications')}
            className={`px-6 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'applications'
                ? 'border-b-2 border-emerald-500 text-emerald-600 dark:text-emerald-400'
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
              <div className="flex gap-3">
                {(userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') && (
                  <button
                    onClick={openApplicationDialog}
                    className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600 hover:shadow-xl hover:shadow-emerald-500/40"
                  >
                    <span className="text-lg">+</span>
                    <span>New Application</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Search applications..."
                value={applicationSearchTerm}
                onChange={(e) => setApplicationSearchTerm(e.target.value)}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Applications List */}
            {loadingApplications ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm py-16 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
                <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading applications...</p>
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-12 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30">
                  <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-emerald-900/10">
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
                            <tr key={app._id} className="transition-colors hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
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
                                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 transition-all"
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
                    <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/30 px-6 py-4 dark:border-slate-700 dark:from-slate-900 dark:to-emerald-900/10">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Processed Applications</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-emerald-900/10">
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
                            <tr key={app._id} className="transition-colors hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
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
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  app.status === 'approved'
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
            {/* Search */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="Search by name, employee no, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Employee List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-12 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30">
              <svg className="h-8 w-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <tr className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50/30 dark:border-slate-700 dark:from-slate-900 dark:to-emerald-900/10">
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
                      className="transition-colors hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 cursor-pointer"
                      onClick={() => handleViewEmployee(employee)}
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
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
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          employee.is_active !== false
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {employee.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeactivate(employee.emp_no, employee.is_active !== false);
                          }}
                          className={`rounded-lg p-2 transition-all ${
                            employee.is_active !== false
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
                designations={filteredApplicationDesignations}
              />

              {/* Allowances & Deductions Overrides */}
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
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Proposed / Gross Salary</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ₹{Number((applicationFormData as any).proposedSalary || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      ₹{applicationSalarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-rose-700 dark:text-rose-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
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
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Allowances</h4>
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        {componentDefaults.allowances.length} items
                      </span>
                  </div>
                    <div className="space-y-2">
                      {componentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-200/70">No allowances available.</p>
                      )}
                      {componentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = overrideAllowances[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-emerald-900 dark:text-emerald-100">{item.name}</div>
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                  </div>
                  </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-emerald-700 dark:text-emerald-300">Override</span>
                    <input
                      type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900 focus:border-emerald-400 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                    />
                  </div>
                  </div>
                  </div>
                        );
                      })}
                </div>
              </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Deductions</h4>
                      <span className="text-xs text-rose-700 dark:text-rose-300">
                        {componentDefaults.deductions.length} items
                      </span>
                  </div>
                    <div className="space-y-2">
                      {componentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-rose-700/70 dark:text-rose-200/70">No deductions available.</p>
                      )}
                      {componentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = overrideDeductions[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-rose-100 bg-white/70 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-rose-900 dark:text-rose-100">{item.name}</div>
                                <div className="text-[11px] text-rose-700 dark:text-rose-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                  </div>
                  </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-rose-700 dark:text-rose-300">Override</span>
                    <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-900 focus:border-rose-400 focus:outline-none dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
                    />
                  </div>
                  </div>
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
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600"
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

              {/* Salary Section - Key Feature */}
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Salary Approval</h3>
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
                      className="w-full rounded-xl border-2 border-emerald-400 bg-white px-4 py-2.5 text-lg font-semibold transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Enter approved salary"
                    />
                    {approvalData.approvedSalary !== selectedApplication.proposedSalary && (
                      <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
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
                      className="w-full rounded-xl border-2 border-emerald-400 bg-white px-4 py-2.5 text-sm font-semibold transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-600 dark:bg-slate-900 dark:text-slate-100"
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">
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
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      ₹{approvalSalarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-rose-700 dark:text-rose-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
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
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Allowances</h4>
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        {approvalComponentDefaults.allowances.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {approvalComponentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-200/70">No allowances available.</p>
                      )}
                      {approvalComponentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = approvalOverrideAllowances[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-emerald-900 dark:text-emerald-100">{item.name}</div>
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-emerald-700 dark:text-emerald-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleApprovalOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900 focus:border-emerald-400 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Deductions</h4>
                      <span className="text-xs text-rose-700 dark:text-rose-300">
                        {approvalComponentDefaults.deductions.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {approvalComponentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-rose-700/70 dark:text-rose-200/70">No deductions available.</p>
                      )}
                      {approvalComponentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = approvalOverrideDeductions[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-rose-100 bg-white/70 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-rose-900 dark:text-rose-100">{item.name}</div>
                                <div className="text-[11px] text-rose-700 dark:text-rose-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-rose-700 dark:text-rose-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleApprovalOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-900 focus:border-rose-400 focus:outline-none dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
                                />
                              </div>
                            </div>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
                  placeholder="Add any comments for this approval..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleApproveApplication}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-emerald-600"
                >
                  Approve & Create Employee
                </button>
                <button
                  onClick={handleRejectApplication}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-red-500 to-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-rose-600"
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
                designations={designations}
              />

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
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">Total Allowances</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      ₹{salarySummary.totalAllowances.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-rose-700 dark:text-rose-300">Total Deductions</p>
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
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
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Allowances</h4>
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        {componentDefaults.allowances.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.allowances.length === 0 && (
                        <p className="text-xs text-emerald-700/70 dark:text-emerald-200/70">No allowances available.</p>
                      )}
                      {componentDefaults.allowances.map((item) => {
                        const key = getKey(item);
                        const current = overrideAllowances[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-emerald-900 dark:text-emerald-100">{item.name}</div>
                                <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-emerald-700 dark:text-emerald-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('allowance', item, e.target.value)}
                                  className="w-24 rounded border border-emerald-200 bg-white px-2 py-1 text-[11px] text-emerald-900 focus:border-emerald-400 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 dark:border-rose-900/40 dark:bg-rose-900/20">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">Deductions</h4>
                      <span className="text-xs text-rose-700 dark:text-rose-300">
                        {componentDefaults.deductions.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {componentDefaults.deductions.length === 0 && (
                        <p className="text-xs text-rose-700/70 dark:text-rose-200/70">No deductions available.</p>
                      )}
                      {componentDefaults.deductions.map((item) => {
                        const key = getKey(item);
                        const current = overrideDeductions[key] ?? item.amount ?? 0;
                        return (
                          <div key={key} className="rounded-lg border border-rose-100 bg-white/70 px-3 py-2 text-xs dark:border-rose-900/50 dark:bg-rose-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-semibold text-rose-900 dark:text-rose-100">{item.name}</div>
                                <div className="text-[11px] text-rose-700 dark:text-rose-300">
                                  {item.type === 'percentage'
                                    ? `${item.percentage || 0}% of ${item.base || item.percentageBase || 'basic'}`
                                    : 'Fixed'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-rose-700 dark:text-rose-300">Override</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={current === null ? '' : current}
                                  onChange={(e) => handleOverrideChange('deduction', item, e.target.value)}
                                  className="w-24 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-900 focus:border-rose-400 focus:outline-none dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100"
                                />
                              </div>
                            </div>
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
                  className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600"
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
          templateHeaders={EMPLOYEE_TEMPLATE_HEADERS}
          templateSample={EMPLOYEE_TEMPLATE_SAMPLE}
          templateFilename="employee_template"
          columns={[
            { key: 'emp_no', label: 'Emp No', width: '100px' },
            { key: 'employee_name', label: 'Name', width: '150px' },
            { key: 'department_name', label: 'Department', type: 'select', options: departments.map(d => ({ value: d.name, label: d.name })), width: '150px' },
            { key: 'designation_name', label: 'Designation', width: '150px' },
            { key: 'doj', label: 'DOJ', type: 'date', width: '120px' },
            { key: 'gender', label: 'Gender', type: 'select', options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }], width: '100px' },
            { key: 'phone_number', label: 'Phone', width: '120px' },
            { key: 'email', label: 'Email', width: '180px' },
          ]}
          validateRow={(row) => {
            const result = validateEmployeeRow(row, departments, designations);
            return { isValid: result.isValid, errors: result.errors };
          }}
          onSubmit={async (data) => {
            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];

            for (const row of data) {
              try {
                // Map department and designation names to IDs
                const deptId = departments.find(d => d.name.toLowerCase() === (row.department_name as string)?.toLowerCase())?._id;
                const desigId = designations.find(d => 
                  d.name.toLowerCase() === (row.designation_name as string)?.toLowerCase() &&
                  d.department === deptId
                )?._id;

                const employeeData = {
                  emp_no: row.emp_no,
                  employee_name: row.employee_name,
                  department_id: deptId || undefined,
                  designation_id: desigId || undefined,
                  doj: row.doj || undefined,
                  dob: row.dob || undefined,
                  gross_salary: row.gross_salary ? Number(row.gross_salary) : undefined,
                  gender: row.gender || undefined,
                  marital_status: row.marital_status || undefined,
                  blood_group: row.blood_group || undefined,
                  qualifications: row.qualifications || undefined,
                  experience: row.experience ? Number(row.experience) : undefined,
                  address: row.address || undefined,
                  location: row.location || undefined,
                  aadhar_number: row.aadhar_number || undefined,
                  phone_number: row.phone_number || undefined,
                  alt_phone_number: row.alt_phone_number || undefined,
                  email: row.email || undefined,
                  pf_number: row.pf_number || undefined,
                  esi_number: row.esi_number || undefined,
                  bank_account_no: row.bank_account_no || undefined,
                  bank_name: row.bank_name || undefined,
                  bank_place: row.bank_place || undefined,
                  ifsc_code: row.ifsc_code || undefined,
                };

                const response = await api.createEmployee(employeeData);
                if (response.success) {
                  successCount++;
                } else {
                  failCount++;
                  errors.push(`${row.emp_no}: ${response.message}`);
                }
              } catch (err) {
                failCount++;
                errors.push(`${row.emp_no}: Failed to create`);
              }
            }

            loadEmployees();

            if (failCount === 0) {
              return { success: true, message: `Successfully created ${successCount} employees` };
            } else {
              return { success: false, message: `Created ${successCount}, Failed ${failCount}. Errors: ${errors.slice(0, 3).join('; ')}` };
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
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.ctcSalary ? `₹${viewingEmployee.ctcSalary.toLocaleString()}` : '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Calculated Salary (Net)</label>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{viewingEmployee.calculatedSalary ? `₹${viewingEmployee.calculatedSalary.toLocaleString()}` : '-'}</p>
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
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Qualifications</label>
                    <div className="mt-1">
                      {(() => {
                        const quals = viewingEmployee.qualifications;
                        if (!quals) return <p className="text-sm font-medium text-slate-900 dark:text-slate-100">-</p>;
                        
                        // Handle array of objects (new format)
                        if (Array.isArray(quals) && quals.length > 0) {
                          return (
                            <div className="space-y-2">
                              {quals.map((qual: any, idx: number) => {
                                if (typeof qual === 'object' && qual !== null) {
                                  // Render object fields
                                  const entries = Object.entries(qual).filter(([_, v]) => v !== null && v !== undefined && v !== '');
                                  if (entries.length === 0) return null;
                                  return (
                                    <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                                      {entries.map(([key, value]) => {
                                        const underscoreRegex = new RegExp('_', 'g');
                                        return (
                                          <div key={key} className="flex gap-2">
                                            <span className="font-medium text-slate-600 dark:text-slate-400 capitalize">{key.replace(underscoreRegex, ' ')}:</span>
                                            <span className="text-slate-900 dark:text-slate-100">{String(value)}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return (
                                  <p key={idx} className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {String(qual)}
                                  </p>
                                );
                              })}
                            </div>
                          );
                        }
                        
                        // Handle string (old format)
                        if (typeof quals === 'string') {
                          return <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{quals}</p>;
                        }
                        
                        // Fallback
                        return <p className="text-sm font-medium text-slate-900 dark:text-slate-100">-</p>;
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

              {/* Reporting Authority Section - Check both root and dynamicFields, handle both reporting_to and reporting_to_ */}
              {(viewingEmployee.reporting_to || viewingEmployee.reporting_to_ || viewingEmployee.dynamicFields?.reporting_to || viewingEmployee.dynamicFields?.reporting_to_) && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Reporting Authority</h3>
                  {(() => {
                    const reportingTo = viewingEmployee.reporting_to || viewingEmployee.reporting_to_ || viewingEmployee.dynamicFields?.reporting_to || viewingEmployee.dynamicFields?.reporting_to_;
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
    </div>
  );
}

