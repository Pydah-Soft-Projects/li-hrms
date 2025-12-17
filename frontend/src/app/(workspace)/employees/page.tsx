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
  const [leftDateForm, setLeftDateForm] = useState({ leftDate: '', leftReason: '' });
  const [includeLeftEmployees, setIncludeLeftEmployees] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    if (user) {
      setUserRole(user.role);
    }
    loadDepartments();
    if (activeTab === 'applications') {
      loadApplications();
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [includeLeftEmployees]);

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
      console.log('Fetching employees with includeLeft:', includeLeftEmployees);
      const response = await api.getEmployees({
        includeLeft: includeLeftEmployees
      });
      console.log('Employees response:', response.success, response.data?.length);
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
      let response;
      if (editingEmployee) {
        response = await api.updateEmployee(editingEmployee.emp_no, formData);
      } else {
        response = await api.createEmployee(formData);
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
    setFormData({
      ...employee,
      department_id: employee.department?._id || employee.department_id || '',
      designation_id: employee.designation?._id || employee.designation_id || '',
      doj: employee.doj ? new Date(employee.doj).toISOString().split('T')[0] : '',
      dob: employee.dob ? new Date(employee.dob).toISOString().split('T')[0] : '',
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

      const response = await api.createEmployeeApplication({
        ...cleanedData,
        proposedSalary: applicationFormData.proposedSalary,
      });

      if (response.success) {
        setSuccess('Employee application created successfully!');
        setShowApplicationDialog(false);
        setApplicationFormData({ ...initialFormState, proposedSalary: 0 });
        loadApplications();
      } else {
        setError(response.message || 'Failed to create application');
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
            <button
              onClick={openCreateDialog}
              className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
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
                {(userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') && (
                  <button
                    onClick={openApplicationDialog}
                    className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-green-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600 hover:shadow-xl hover:shadow-green-500/40"
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
              {/* Basic Info - Same as employee form but with Proposed Salary */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Basic Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Employee No *
                    </label>
                    <input
                      type="text"
                      name="emp_no"
                      value={applicationFormData.emp_no || ''}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setApplicationFormData(prev => ({
                          ...prev,
                          emp_no: value,
                        }));
                      }}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="E.g., EMP001"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Employee Name *
                    </label>
                    <input
                      type="text"
                      name="employee_name"
                      value={applicationFormData.employee_name || ''}
                      onChange={handleApplicationInputChange}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
                    <select
                      name="department_id"
                      value={typeof applicationFormData.department_id === 'string' ? applicationFormData.department_id : (applicationFormData.department_id?._id || '')}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
                    <select
                      name="designation_id"
                      value={typeof applicationFormData.designation_id === 'string' ? applicationFormData.designation_id : (applicationFormData.designation_id?._id || '')}
                      onChange={handleApplicationInputChange}
                      disabled={!applicationFormData.department_id}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select Designation</option>
                      {filteredApplicationDesignations.map((desig) => (
                        <option key={desig._id} value={desig._id}>{desig.name}</option>
                      ))}
                    </select>
                  </div>
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
              </div>

              {/* Personal Information */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Personal Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Date of Birth</label>
                    <input
                      type="date"
                      name="dob"
                      value={applicationFormData.dob || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Gender</label>
                    <select
                      name="gender"
                      value={applicationFormData.gender || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Marital Status</label>
                    <select
                      name="marital_status"
                      value={applicationFormData.marital_status || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Blood Group</label>
                    <select
                      name="blood_group"
                      value={applicationFormData.blood_group || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Qualifications</label>
                    <input
                      type="text"
                      name="qualifications"
                      value={applicationFormData.qualifications || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="E.g., B.Tech, MBA"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Experience (Years)</label>
                    <input
                      type="number"
                      name="experience"
                      value={applicationFormData.experience || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                    <input
                      type="text"
                      name="address"
                      value={applicationFormData.address || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Location</label>
                    <input
                      type="text"
                      name="location"
                      value={applicationFormData.location || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Aadhar Number</label>
                    <input
                      type="text"
                      name="aadhar_number"
                      value={applicationFormData.aadhar_number || ''}
                      onChange={handleApplicationInputChange}
                      maxLength={12}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Contact & Employment */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contact & Employment</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone Number</label>
                    <input
                      type="text"
                      name="phone_number"
                      value={applicationFormData.phone_number || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Alt. Phone</label>
                    <input
                      type="text"
                      name="alt_phone_number"
                      value={applicationFormData.alt_phone_number || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={applicationFormData.email || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">PF Number</label>
                    <input
                      type="text"
                      name="pf_number"
                      value={applicationFormData.pf_number || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">ESI Number</label>
                    <input
                      type="text"
                      name="esi_number"
                      value={applicationFormData.esi_number || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bank Details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank A/C No</label>
                    <input
                      type="text"
                      name="bank_account_no"
                      value={applicationFormData.bank_account_no || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank Name</label>
                    <input
                      type="text"
                      name="bank_name"
                      value={applicationFormData.bank_name || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank Place</label>
                    <input
                      type="text"
                      name="bank_place"
                      value={applicationFormData.bank_place || ''}
                      onChange={handleApplicationInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">IFSC Code</label>
                    <input
                      type="text"
                      name="ifsc_code"
                      value={applicationFormData.ifsc_code || ''}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setApplicationFormData(prev => ({
                          ...prev,
                          ifsc_code: value,
                        }));
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
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
              {/* Basic Info */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Basic Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Employee No *
                    </label>
                    <input
                      type="text"
                      name="emp_no"
                      value={formData.emp_no || ''}
                      onChange={handleInputChange}
                      required
                      disabled={!!editingEmployee}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="E.g., EMP001"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Employee Name *
                    </label>
                    <input
                      type="text"
                      name="employee_name"
                      value={formData.employee_name || ''}
                      onChange={handleInputChange}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Full Name"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Department</label>
                    <select
                      name="department_id"
                      value={formData.department_id || ''}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select Department</option>
                      {departments.map((dept) => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
                    <select
                      name="designation_id"
                      value={formData.designation_id || ''}
                      onChange={handleInputChange}
                      disabled={!formData.department_id}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select Designation</option>
                      {filteredDesignations.map((desig) => (
                        <option key={desig._id} value={desig._id}>{desig.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Date of Joining</label>
                    <input
                      type="date"
                      name="doj"
                      value={formData.doj || ''}
                      onChange={handleInputChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Personal Info */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Personal Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Date of Birth</label>
                    <input type="date" name="dob" value={formData.dob || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Gender</label>
                    <select name="gender" value={formData.gender || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Marital Status</label>
                    <select name="marital_status" value={formData.marital_status || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Select</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Blood Group</label>
                    <select name="blood_group" value={formData.blood_group || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Select</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Qualifications</label>
                    <input type="text" name="qualifications" value={formData.qualifications || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" placeholder="E.g., B.Tech, MBA" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Experience (Years)</label>
                    <input type="number" name="experience" value={formData.experience || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Address</label>
                    <input type="text" name="address" value={formData.address || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Location</label>
                    <input type="text" name="location" value={formData.location || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Aadhar Number</label>
                    <input type="text" name="aadhar_number" value={formData.aadhar_number || ''} onChange={handleInputChange} maxLength={12} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Contact & Employment */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contact & Employment</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone Number</label>
                    <input type="text" name="phone_number" value={formData.phone_number || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Alt. Phone</label>
                    <input type="text" name="alt_phone_number" value={formData.alt_phone_number || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                    <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Gross Salary</label>
                    <input type="number" name="gross_salary" value={formData.gross_salary || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">PF Number</label>
                    <input type="text" name="pf_number" value={formData.pf_number || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">ESI Number</label>
                    <input type="text" name="esi_number" value={formData.esi_number || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Bank Details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank A/C No</label>
                    <input type="text" name="bank_account_no" value={formData.bank_account_no || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank Name</label>
                    <input type="text" name="bank_name" value={formData.bank_name || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Bank Place</label>
                    <input type="text" name="bank_place" value={formData.bank_place || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">IFSC Code</label>
                    <input type="text" name="ifsc_code" value={formData.ifsc_code || ''} onChange={handleInputChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm uppercase transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded text-green-600 focus:ring-green-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Active Employee
                </label>
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

