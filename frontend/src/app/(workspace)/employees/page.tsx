'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import BulkUpload from '@/components/BulkUpload';
import {
  EMPLOYEE_TEMPLATE_HEADERS,
  EMPLOYEE_TEMPLATE_SAMPLE,
  validateEmployeeRow,
  ParsedRow,
} from '@/lib/bulkUpload';
import DynamicEmployeeForm from '@/components/DynamicEmployeeForm';

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
  qualifications?: any;
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
  qualifications?: any;
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
  qualifications: [], // Changed from '' to []
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
  const [formData, setFormData] = useState<Partial<Employee>>(initialFormState);
  const [applicationFormData, setApplicationFormData] = useState<Partial<EmployeeApplication & { proposedSalary: number }>>({ ...initialFormState, proposedSalary: 0 });
  const [approvalData, setApprovalData] = useState({ approvedSalary: 0, doj: '', comments: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dataSource, setDataSource] = useState<string>('mongodb');
  const [searchTerm, setSearchTerm] = useState('');
  const [applicationSearchTerm, setApplicationSearchTerm] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [showLeftDateModal, setShowLeftDateModal] = useState(false);
  const [selectedEmployeeForLeftDate, setSelectedEmployeeForLeftDate] = useState<Employee | null>(null);
  const [formSettings, setFormSettings] = useState<any>(null); // To store dynamic settings for mapping
  const [leftDateForm, setLeftDateForm] = useState({ leftDate: '', leftReason: '' });
  const [includeLeftEmployees, setIncludeLeftEmployees] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);

  const [dynamicTemplate, setDynamicTemplate] = useState<{ headers: string[]; sample: any[]; columns: any[] }>({
    headers: EMPLOYEE_TEMPLATE_HEADERS,
    sample: EMPLOYEE_TEMPLATE_SAMPLE,
    columns: [],
  });

  useEffect(() => {
    const user = auth.getUser();
    if (user) {
      setUserRole(user.role);
    }
    loadEmployees();
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
      const response = await api.getEmployees({
        ...(includeLeftEmployees ? { includeLeft: true } : {}),
      });
      if (response.success) {
        setEmployees(response.data || []);
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
      { id: 'proposedSalary', label: 'Proposed Salary', sample: 50000, width: '120px', type: 'number' },
    ];

    permanentFields.forEach(f => {
      headers.push(f.id);
      sample[f.id] = f.sample;
      columns.push({ key: f.id, label: f.label, width: f.width, type: f.type || 'text' });
    });

    // Department and Designation names (for matching)
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
        // Skip already added permanent fields
        if (headers.includes(field.id)) return;

        headers.push(field.id);

        // Value placeholder/sample
        if (field.type === 'date') {
          sample[field.id] = '2024-01-01';
          columns.push({ key: field.id, label: field.label, type: 'date' });
        } else if (field.type === 'number') {
          sample[field.id] = 0;
          columns.push({ key: field.id, label: field.label, type: 'number' });
        } else if (field.type === 'select') {
          sample[field.id] = field.options?.[0]?.value || '';
          columns.push({ key: field.id, label: field.label, type: 'select', options: field.options });
        } else if (field.type === 'array' || field.type === 'object') {
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
        headers.push('qualifications');
        sample['qualifications'] = 'Degree:Year, Degree:Year';
        columns.push({ key: 'qualifications', label: 'Qualifications' });
      }
    }

    setDynamicTemplate({
      headers,
      sample: [sample],
      columns: columns.map(c => ({ ...c, width: c.width || '150px' }))
    });
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

  const parseDynamicField = (value: any, fieldDef: any) => {
    if (value === undefined || value === null || value === '') return undefined;

    if (fieldDef.type === 'array') {
      if (fieldDef.dataType === 'object' || fieldDef.itemType === 'object') {
        // Format: field1:val1|field2:val2, field1:val3|field2:val4
        // Support shorthand for qualifications if it's just Degree:Year
        return String(value).split(',').map((item: string) => {
          const obj: any = {};
          const parts = item.split(/[|:]/);

          // If it's field1:val1|field2:val2 format
          if (item.includes('|')) {
            item.split('|').forEach(part => {
              const [k, v] = part.split(':').map(s => s.trim());
              if (k && v) obj[k] = v;
            });
          } else if (item.includes(':')) {
            // Shorthand Degree:Year
            const [v1, v2] = item.split(':').map(s => s.trim());
            // Try to map to the first two fields of the array item schema
            const fields = fieldDef.itemSchema?.fields || fieldDef.fields || [];
            if (fields[0]) obj[fields[0].id] = v1;
            if (fields[1]) obj[fields[1].id] = v2;
          } else {
            // Just a string
            const fields = fieldDef.itemSchema?.fields || fieldDef.fields || [];
            if (fields[0]) obj[fields[0].id] = item.trim();
          }
          return obj;
        });
      } else {
        // Format: val1, val2
        return String(value).split(',').map((item: string) => item.trim());
      }
    }

    if (fieldDef.type === 'object') {
      // Format: key1:val1|key2:val2
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value ? Number(value) : undefined) : value,
    }));
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
      // Construct FormData for multipart/form-data submission
      const payload = new FormData();

      // Append standard fields
      Object.entries(formData).forEach(([key, value]) => {
        if (key === 'qualifications') return; // Handle separately
        if (value === undefined || value === null) return;

        if (typeof value === 'object' && !(value instanceof Date)) {
          // Stringify complex objects/arrays (except Date if it were one, but here dates are strings)
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
          // If key matches a known field ID, use its label; otherwise keep key (e.g. stored urls)
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
      // Note: api.createEmployee/updateEmployee argument type is likely Partial<Employee>, 
      // but payload is FormData. We rely on api.ts handling FormData and generic T. 
      // We might need to cast or ignore TS error if the interface is strict.
      // Checking api.ts interface: createEmployee(data: Partial<Employee>)
      // Ideally I should update the interface in api.ts, but standard JS/TS allows passing any if not strict.
      // Let's cast to any to avoid build errors.
      if (editingEmployee) {
        response = await api.updateEmployee(editingEmployee.emp_no, payload as any);
      } else {
        response = await api.createEmployee(payload as any);
      }

      if (response.success) {
        setSuccess(editingEmployee ? 'Employee updated successfully!' : 'Employee created successfully!');
        setShowDialog(false);
        setEditingEmployee(null);
        setFormData(initialFormState);
        loadEmployees();
      } else {
        setError(response.message || 'Operation failed');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    let processedQualifications = employee.qualifications;

    // Handle legacy string format for qualifications
    if (typeof processedQualifications === 'string' && processedQualifications) {
      // Assuming naive comma split for legacy data: "B.Tech, MBA" -> [{ degree: "B.Tech" }, { degree: "MBA" }]
      // This matches the backend virtual logic but does it client-side if needed
      processedQualifications = processedQualifications.split(',').map(s => ({ degree: s.trim() }));
    } else if (!processedQualifications) {
      processedQualifications = [];
    }

    setFormData({
      ...employee,
      department_id: employee.department?._id || employee.department_id || '',
      designation_id: employee.designation?._id || employee.designation_id || '',
      doj: employee.doj ? new Date(employee.doj).toISOString().split('T')[0] : '',
      dob: employee.dob ? new Date(employee.dob).toISOString().split('T')[0] : '',
      qualifications: processedQualifications, // Use processed array
    });
    setShowDialog(true);
  };

  const handleDelete = async (empNo: string) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;

    try {
      const response = await api.deleteEmployee(empNo);
      if (response.success) {
        setSuccess('Employee deleted successfully!');
        loadEmployees();
      } else {
        setError(response.message || 'Failed to delete employee');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const openCreateDialog = () => {
    setEditingEmployee(null);
    setFormData(initialFormState);
    setShowDialog(true);
    setError('');
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

  const filteredEmployees = employees.filter(emp => {
    // Filter by search term
    const matchesSearch =
      emp.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.emp_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter by left employees (if includeLeftEmployees is false, exclude those with leftDate)
    const matchesLeftFilter = includeLeftEmployees || !emp.leftDate;

    return matchesSearch && matchesLeftFilter;
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

    if (!applicationFormData.emp_no || !applicationFormData.employee_name || !applicationFormData.proposedSalary) {
      setError('Employee No, Name, and Proposed Salary are required');
      return;
    }

    try {
      // Construct FormData for multipart/form-data submission
      const payload = new FormData();

      const submitData = { ...applicationFormData };

      // Clean up enum fields
      const enumFields = ['gender', 'marital_status', 'blood_group'];
      enumFields.forEach(field => {
        if (submitData[field] === '' || submitData[field] === undefined) {
          submitData[field] = null;
        }
      });
      // Convert empty strings to undefined for other optional fields
      Object.keys(submitData).forEach(key => {
        if (submitData[key] === '' && !enumFields.includes(key) && key !== 'qualifications') {
          submitData[key] = undefined;
        }
      });

      // Handle Qualifications Mapping (Field ID -> Label)
      let qualificationsToSend = submitData.qualifications;

      // Only map if it's an array (Dynamic Form data)
      if (Array.isArray(qualificationsToSend) && formSettings?.qualifications?.fields) {
        const fieldIdToLabelMap: Record<string, string> = {};
        formSettings.qualifications.fields.forEach((f: any) => {
          fieldIdToLabelMap[f.id] = f.label;
        });

        qualificationsToSend = qualificationsToSend.map((q: any, index: number) => {
          const { certificateFile, ...rest } = q;
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
      }

      // Append fields to FormData
      Object.entries(submitData).forEach(([key, value]) => {
        if (key === 'qualifications') return; // Handled below
        if (value === undefined || value === null) return;

        if (typeof value === 'object' && !(value instanceof Date)) {
          payload.append(key, JSON.stringify(value));
        } else {
          payload.append(key, String(value));
        }
      });

      // Append processed qualifications
      if (qualificationsToSend) {
        payload.append('qualifications', typeof qualificationsToSend === 'string' ? qualificationsToSend : JSON.stringify(qualificationsToSend));
      }

      // API Call
      // Note: api.createEmployeeApplication needs to handle FormData. 
      // Checked api.ts: apiRequest checks (options.body instanceof FormData) and sets headers accordingly.
      // So passing payload directly is safe assuming createEmployeeApplication signature allows 'any'.
      const response = await api.createEmployeeApplication(payload as any);

      if (response.success) {
        setSuccess('Employee application created successfully!');
        setShowApplicationDialog(false);
        setApplicationFormData({ ...initialFormState, proposedSalary: 0 });
        loadApplications();
      } else {
        setError(response.message || 'Failed to create application');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
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
    setShowApprovalDialog(true);
    setError('');
    setSuccess('');
  };

  const openApplicationDialog = () => {
    setApplicationFormData({ ...initialFormState, proposedSalary: 0 });
    setShowApplicationDialog(true);
    setError('');
  };

  const toggleSelectAll = () => {
    const pendingApps = pendingApplications;
    if (selectedApplicationIds.length === pendingApps.length && pendingApps.length > 0) {
      setSelectedApplicationIds([]);
    } else {
      setSelectedApplicationIds(pendingApps.map(app => app._id));
    }
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
              onClick={() => setShowBulkUpload(true)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            {(userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') && (
              <button
                onClick={openApplicationDialog}
                className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
              >
                <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Application
              </button>
            )}
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
              <div className="flex gap-3">
                {selectedApplicationIds.length > 0 && (userRole === 'super_admin' || userRole === 'sub_admin') && (
                  <button
                    onClick={handleBulkApprove}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/40"
                  >
                    <span>Approve Selected ({selectedApplicationIds.length})</span>
                  </button>
                )}
              </div>
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
                                onChange={toggleSelectAll}
                                className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 dark:border-slate-600 cursor-pointer"
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
                            <tr key={app._id} className={`transition-colors hover:bg-green-50/30 dark:hover:bg-green-900/10 ${selectedApplicationIds.includes(app._id) ? 'bg-green-50/50 dark:bg-green-900/20' : ''}`}>
                              <td className="px-6 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedApplicationIds.includes(app._id)}
                                  onChange={() => toggleSelectApplication(app._id)}
                                  className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 dark:border-slate-600 cursor-pointer"
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
            {/* Search and Filter */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <input
                type="text"
                placeholder="Search by name, employee no, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 min-w-[250px] max-w-md rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
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
            </div>

            {/* Employee List */}
            {loading ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
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
                        <tr key={employee.emp_no} className="transition-colors hover:bg-green-50/30 dark:hover:bg-green-900/10">
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
                              onClick={() => handleEdit(employee)}
                              className="mr-2 rounded-lg p-2 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {employee.leftDate ? (
                              <button
                                onClick={() => handleRemoveLeftDate(employee)}
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
                                  onClick={() => handleSetLeftDate(employee)}
                                  className="mr-2 rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                  title="Set Left Date"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDelete(employee.emp_no)}
                                  className="rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                  title="Delete"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
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

              {/* Use DynamicEmployeeForm for standard employee fields */}
              <DynamicEmployeeForm
                formData={applicationFormData}
                onChange={(newData) => {
                  setApplicationFormData(prev => ({
                    ...prev,
                    ...newData
                  }));
                }}
                onSettingsLoaded={setFormSettings} // Critical for label mapping
                isViewMode={false}
              />

              {/* Application Specific Fields */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Application Details</h3>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Proposed Salary *
                  </label>
                  <input
                    type="number"
                    name="proposedSalary"
                    value={applicationFormData.proposedSalary || ''}
                    onChange={handleApplicationInputChange}
                    required
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="0.00"
                  />
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
                onChange={(newData) => {
                  // Preserve existing fields that might not be in the form (like _id)
                  setFormData(prev => ({
                    ...prev,
                    ...newData,
                    // Ensure core fields are synced if DynamicEmployeeForm updates them
                    emp_no: newData.emp_no || prev.emp_no,
                    employee_name: newData.employee_name || prev.employee_name,
                  }));
                }}
                errors={
                  // Convert single error string to object if needed, or pass explicit field errors if we had them
                  error ? { form: error } : {}
                }
                departments={departments}
                designations={designations}
              />

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
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
          title="Bulk Upload Employee Applications"
          templateHeaders={dynamicTemplate.headers}
          templateSample={dynamicTemplate.sample}
          templateFilename="employee_application_template"
          columns={dynamicTemplate.columns}
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
                const employeeData: any = {};

                // 1. Mandatory Core Fields
                employeeData.emp_no = String(row.emp_no || '').toUpperCase();
                employeeData.employee_name = row.employee_name;
                employeeData.proposedSalary = row.proposedSalary ? Number(row.proposedSalary) : undefined;

                // 2. Department & Designation mapping
                const deptId = departments.find(d => d.name.toLowerCase() === (row.department_name as string)?.toLowerCase())?._id;
                const desigId = designations.find(d =>
                  d.name.toLowerCase() === (row.designation_name as string)?.toLowerCase() &&
                  d.department === deptId
                )?._id;
                employeeData.department_id = deptId;
                employeeData.designation_id = desigId;

                // 3. Process fields using FormSettings
                const processedKeys = ['emp_no', 'employee_name', 'proposedSalary', 'department_id', 'designation_id', 'department_name', 'designation_name'];

                if (formSettings?.groups) {
                  formSettings.groups.forEach((group: any) => {
                    group.fields.forEach((field: any) => {
                      if (row[field.id] !== undefined && row[field.id] !== null && row[field.id] !== '') {
                        if (processedKeys.includes(field.id)) return;

                        employeeData[field.id] = parseDynamicField(row[field.id], field);
                        processedKeys.push(field.id);
                      }
                    });
                  });
                }

                // 4. Special case: Qualifications
                if (formSettings?.qualifications?.isEnabled && row.qualifications) {
                  const qualDef = {
                    type: 'array',
                    itemType: 'object',
                    fields: formSettings.qualifications.fields
                  };
                  employeeData.qualifications = parseDynamicField(row.qualifications, qualDef);
                  processedKeys.push('qualifications');
                }

                // 5. Handle leftovers as dynamicFields
                const dynamicFields: any = {};
                Object.keys(row).forEach(key => {
                  if (!processedKeys.includes(key) &&
                    key !== '_rowIndex' &&
                    row[key] !== undefined &&
                    row[key] !== null &&
                    row[key] !== '') {
                    dynamicFields[key] = row[key];
                  }
                });

                if (Object.keys(dynamicFields).length > 0) {
                  employeeData.dynamicFields = dynamicFields;
                }

                const response = await api.createEmployeeApplication(employeeData);
                if (response.success) {
                  successCount++;
                } else {
                  failCount++;
                  errors.push(`${row.emp_no || 'Row'}: ${response.message}`);
                }
              } catch (err) {
                failCount++;
                errors.push(`${row.emp_no || 'Row'}: Failed to create application`);
                console.error('Bulk upload row error:', err);
              }
            }

            loadApplications();

            if (failCount === 0) {
              return { success: true, message: `Successfully created ${successCount} applications` };
            } else {
              return { success: false, message: `Created ${successCount}, Failed ${failCount}. ${errors.length > 0 ? 'First error: ' + errors[0] : ''}` };
            }
          }}
          onClose={() => setShowBulkUpload(false)}
        />
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

