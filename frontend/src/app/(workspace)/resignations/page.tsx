'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Division, Department, EmployeeGroup } from '@/lib/api';
import { auth } from '@/lib/auth';
import { canViewResignation, canApplyResignation, canApproveResignation } from '@/lib/permissions';
import { toast, ToastContainer } from 'react-toastify';
import Swal from 'sweetalert2';
import 'react-toastify/dist/ReactToastify.css';

import {
  LogOut,
  Search,
  Eye,
  Check,
  X,
  Filter,
  CheckCircle2,
  Clock,
  Clock3,
  ListTodo,
  Plus,
  Calendar,
  Save,
  LayoutGrid,
  List,
  Pencil,
} from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, bgClass, iconClass, dekorClass, loading }: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }>; bgClass: string; iconClass: string; dekorClass?: string; loading?: boolean }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 truncate">{title}</p>
        <div className="mt-1 sm:mt-2 flex items-baseline gap-2">
          {loading ? (
            <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          ) : (
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
          )}
        </div>
      </div>
      <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl shrink-0 ${bgClass} ${iconClass}`}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
    </div>
    {dekorClass && <div className={`absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 rounded-full ${dekorClass}`} />}
  </div>
);

interface ResignationRequest {
  _id: string;
  employeeId?: {
    _id: string;
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no: string;
    department_id?: { _id: string; name: string };
    division_id?: { _id: string; name: string };
    employee_group_id?: { _id: string; name: string };
    doj?: string;
    dynamicFields?: Record<string, any>;
    agreementStartDate?: string;
    agreementEndDate?: string;
    agreement_start_date?: string;
    agreement_end_date?: string;
    contractStartDate?: string;
    contractEndDate?: string;
    contract_start_date?: string;
    contract_end_date?: string;
  };
  emp_no: string;
  leftDate: string;
  remarks: string;
  status: string;
  requestedBy?: { _id: string; name: string; email?: string };
  requestType?: 'resignation' | 'termination';
  createdAt: string;
  workflow?: {
    currentStepRole?: string;
    nextApproverRole?: string;
    isCompleted?: boolean;
    approvalChain?: Array<{
      stepOrder?: number;
      role?: string;
      label?: string;
      status?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      updatedAt?: string;
      updatedAtIST?: string;
      canEditLWD?: boolean;
    }>;
    history?: Array<{
      step?: string;
      action?: string;
      actionByName?: string;
      actionByRole?: string;
      comments?: string;
      timestamp?: string;
    }>;
    reportingManagerIds?: string[];
  };
  isLwdManual?: boolean;
  lwdHistory?: Array<{
    oldDate: string;
    newDate: string;
    updatedBy?: string;
    updatedByName?: string;
    updatedByRole?: string;
    comments?: string;
    timestamp?: string;
  }>;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'final_approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'hod_approved':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'manager_approved':
      return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
    case 'reporting_manager_approved':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
    case 'hr_approved':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'approved':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'rejected':
    case 'cancelled':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';
  }
};

const getDisplayStatus = (req?: ResignationRequest | null) => {
  if (!req) return 'pending';
  const baseStatus = (req.status || 'pending').toLowerCase();
  if (baseStatus === 'pending') {
    const hasApprovedStep = (req.workflow?.approvalChain || []).some(
      (step) => (step.status || '').toLowerCase() === 'approved'
    );
    if (hasApprovedStep) return 'approved';
  }
  return baseStatus;
};

const normalizeApprovalStageLabel = (label?: string) => {
  if (!label) return '';
  return String(label).replace(/\s*approval\s*$/i, '').trim();
};

const toDisplayCase = (value: string) => {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const getLatestApprovedByLabel = (req?: ResignationRequest | null) => {
  const approvedSteps = (req?.workflow?.approvalChain || []).filter(
    (step) => (step.status || '').toLowerCase() === 'approved'
  );
  if (approvedSteps.length === 0) return '';
  const latestApprovedStep = approvedSteps[approvedSteps.length - 1];
  const fallbackRole = (latestApprovedStep.role || '').replace(/_/g, ' ');
  return normalizeApprovalStageLabel(latestApprovedStep.label || fallbackRole);
};

const getStatusVisualKey = (req?: ResignationRequest | null) => {
  const displayStatus = getDisplayStatus(req);
  if (displayStatus !== 'approved') return displayStatus;

  if ((req?.status || '').toLowerCase() === 'approved' || req?.workflow?.isCompleted) {
    return 'final_approved';
  }

  const approvedBy = getLatestApprovedByLabel(req).toLowerCase();
  if (approvedBy.includes('reporting manager')) return 'reporting_manager_approved';
  if (approvedBy.includes('manager')) return 'manager_approved';
  if (approvedBy.includes('hod') || approvedBy.includes('head of department')) return 'hod_approved';
  if (approvedBy.includes('hr')) return 'hr_approved';
  return 'approved';
};

const getDisplayStatusText = (req?: ResignationRequest | null) => {
  const displayStatus = getDisplayStatus(req);
  if (displayStatus === 'approved') {
    if ((req?.status || '').toLowerCase() === 'approved' || req?.workflow?.isCompleted) {
      return 'Approved';
    }
    const approvedBy = getLatestApprovedByLabel(req);
    return approvedBy ? `${toDisplayCase(approvedBy)} approved` : 'Approved';
  }
  return toDisplayCase(displayStatus);
};

const formatDate = (dateStr: string, isManual?: boolean, status?: string) => {
  if (!dateStr) return '—';
  const formatted = new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  
  if (status === 'pending' && isManual === false) {
    return `(Tentative) ${formatted}`;
  }
  return formatted;
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateDash = (dateStr?: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).replace(/\s+/g, '-');
};

/** Format date as YYYY-MM-DD in local time (avoids UTC shift that makes "today + 90" show as previous day) */
const toLocalDateString = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getEmployeeName = (req: ResignationRequest) => {
  const emp = req.employeeId;
  if (!emp) return req.emp_no || '—';
  if (emp.employee_name) return emp.employee_name;
  if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
  if (emp.first_name) return emp.first_name;
  return emp.emp_no || '—';
};

const getEmployeeInitials = (req: ResignationRequest) => {
  const name = getEmployeeName(req);
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (name[0] || 'E').toUpperCase();
};

const parseDateSafe = (value: any): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const getAgreementDatesFromEmployee = (emp: any): { startDate?: string; endDate?: string } => {
  if (!emp) return {};
  const dynamic = emp.dynamicFields || {};
  const start =
    emp.agreementStartDate ||
    emp.agreement_start_date ||
    emp.contractStartDate ||
    emp.contract_start_date ||
    dynamic.agreementStartDate ||
    dynamic.agreement_start_date ||
    dynamic.contractStartDate ||
    dynamic.contract_start_date;
  const end =
    emp.agreementEndDate ||
    emp.agreement_end_date ||
    emp.contractEndDate ||
    emp.contract_end_date ||
    dynamic.agreementEndDate ||
    dynamic.agreement_end_date ||
    dynamic.contractEndDate ||
    dynamic.contract_end_date;
  return { startDate: start, endDate: end };
};

const isEmployeeRole = (user: any) => String(user?.role || '').toLowerCase() === 'employee';

const canInitiateTermination = (user: any, settings: any) => {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  
  const allowedRoles = settings?.workflow?.terminationAllowedRoles || ['super_admin', 'hr'];
  return allowedRoles.includes(role);
};

export default function ResignationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [allRequests, setAllRequests] = useState<ResignationRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ResignationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ResignationRequest | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [editableLWD, setEditableLWD] = useState('');
  const [detailLwdEditMode, setDetailLwdEditMode] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applySelfOnly, setApplySelfOnly] = useState(false);
  const [applyEmployees, setApplyEmployees] = useState<{ emp_no: string; name: string }[]>([]);
  const [applyEmployeeMeta, setApplyEmployeeMeta] = useState<Record<string, { agreementStartDate?: string; agreementEndDate?: string }>>({});
  const [applyEmployeeSearch, setApplyEmployeeSearch] = useState('');
  const [applySelectedEmpNo, setApplySelectedEmpNo] = useState('');
  const [applyRemarks, setApplyRemarks] = useState('');
  const [applyLastWorkingDate, setApplyLastWorkingDate] = useState('');
  const [applyType, setApplyType] = useState<'resignation' | 'termination'>('resignation');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyModalLoading, setApplyModalLoading] = useState(false);
  const [applyPendingAssets, setApplyPendingAssets] = useState<any[]>([]);
  const [applyPendingAssetsLoading, setApplyPendingAssetsLoading] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    status: '',
    division_id: '',
    department_id: '',
    employee_group_id: '',
  });
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);

  const [resignationSettings, setResignationSettings] = useState<any>(null);
  const [viewType, setViewType] = useState<'card' | 'list'>('list');

  const selectedApplyEmployeeAgreement = useMemo(() => {
    return applyEmployeeMeta[applySelectedEmpNo] || {};
  }, [applyEmployeeMeta, applySelectedEmpNo]);

  const filteredApplyEmployees = useMemo(() => {
    const q = applyEmployeeSearch.trim().toLowerCase();
    if (!q) return applyEmployees;
    return applyEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(q) || emp.emp_no.toLowerCase().includes(q)
    );
  }, [applyEmployees, applyEmployeeSearch]);

  useEffect(() => {
    if (!showApplyModal || !applySelectedEmpNo) {
      setApplyPendingAssets([]);
      return;
    }
    let cancelled = false;
    const loadPendingAssets = async () => {
      setApplyPendingAssetsLoading(true);
      try {
        if (applySelfOnly) {
          const myAssetsRes = await api.getMyAssetAssignments();
          if (cancelled) return;
          const pending = Array.isArray(myAssetsRes?.data)
            ? myAssetsRes.data.filter((item: any) => item?.status === 'assigned')
            : [];
          setApplyPendingAssets(pending);
          return;
        }
        const employeeRes = await api.getEmployee(applySelectedEmpNo);
        const employeeId = employeeRes?.success ? employeeRes?.data?._id : null;
        if (!employeeId) {
          if (!cancelled) setApplyPendingAssets([]);
          return;
        }
        const assetsRes = await api.getAssetAssignments({ employeeId, status: 'assigned' });
        if (cancelled) return;
        setApplyPendingAssets(Array.isArray(assetsRes?.data) ? assetsRes.data : []);
      } catch (_) {
        if (!cancelled) setApplyPendingAssets([]);
      } finally {
        if (!cancelled) setApplyPendingAssetsLoading(false);
      }
    };
    void loadPendingAssets();
    return () => {
      cancelled = true;
    };
  }, [showApplyModal, applySelectedEmpNo, applySelfOnly]);

  useEffect(() => {
    const user = auth.getUser();
    if (user) setCurrentUser(user);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = auth.getUser();
      const isEmployee = isEmployeeRole(user);
      const [allRes, divRes, depRes, grpRes] = await Promise.all([
        api.getResignationRequests(),
        api.getDivisions(true),
        api.getDepartments(true),
        api.getEmployeeGroups(true)
      ]);

      if (allRes.success && allRes.data) setAllRequests(Array.isArray(allRes.data) ? allRes.data : []);
      else setAllRequests([]);

      if (divRes.success && divRes.data) setDivisions(divRes.data);
      if (depRes.success && depRes.data) setDepartments(depRes.data);
      if (grpRes.success && grpRes.data) setGroups(grpRes.data);

      if (!isEmployee) {
        const [pendingRes, settingsRes] = await Promise.all([
          api.getResignationPendingApprovals(),
          api.getResignationSettings()
        ]);
        if (pendingRes.success && pendingRes.data) setPendingRequests(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        else setPendingRequests([]);
        if (settingsRes.success && settingsRes.data) setResignationSettings(settingsRes.data);
      } else {
        setPendingRequests([]);
        const settingsRes = await api.getResignationSettings();
        if (settingsRes.success && settingsRes.data) setResignationSettings(settingsRes.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openApplyModal = (selfOnly: boolean = false, type: 'resignation' | 'termination' = 'resignation') => {
    setApplySelfOnly(!!selfOnly);
    setApplyType(type);
    const user = auth.getUser();
    const myEmpNo = user?.emp_no || (user as any)?.employeeId;
    if (selfOnly && myEmpNo) {
      setApplySelectedEmpNo(String(myEmpNo));
    } else {
      setApplySelectedEmpNo('');
    }
    setApplyRemarks('');
    setApplyEmployeeSearch('');
    setApplyPendingAssets([]);
    
    if (type === 'termination') {
      setApplyLastWorkingDate(toLocalDateString(new Date()));
    } else {
      setApplyLastWorkingDate('');
    }
    
    setShowApplyModal(true);
  };

  const handleApplyTypeChange = (type: 'resignation' | 'termination') => {
    setApplyType(type);
    if (type === 'termination') {
      setApplyLastWorkingDate(toLocalDateString(new Date()));
    } else {
      // For resignation, we can either clear it or let the notice period calc (which happens in useEffect) take over
      setApplyLastWorkingDate('');
    }
  };

  useEffect(() => {
    if (!showApplyModal) return;
    let cancelled = false;
    const load = async () => {
      setApplyModalLoading(true);
      try {
        if (applySelfOnly) {
          const settingsRes = await api.getResignationSettings();
          if (cancelled) return;
          const raw = settingsRes?.data?.noticePeriodDays ?? settingsRes?.data?.value?.noticePeriodDays;
          const noticeDays = Math.max(0, Number(raw) || 0);
          const minDate = new Date();
          minDate.setDate(minDate.getDate() + noticeDays);
          minDate.setHours(0, 0, 0, 0);
          setApplyLastWorkingDate(toLocalDateString(minDate));
          const user = auth.getUser();
          const myEmpNo = user?.emp_no || (user as any)?.employeeId;
          if (myEmpNo) {
            try {
              const employeeRes = await api.getEmployee(String(myEmpNo));
              if (!cancelled && employeeRes?.success && employeeRes?.data) {
                const dates = getAgreementDatesFromEmployee(employeeRes.data);
                setApplyEmployeeMeta({
                  [String(myEmpNo)]: {
                    agreementStartDate: dates.startDate,
                    agreementEndDate: dates.endDate,
                  },
                });
              }
            } catch (_) {
              if (!cancelled) setApplyEmployeeMeta({});
            }
          }
        } else {
          const [settingsRes, empRes] = await Promise.all([
            api.getResignationSettings(),
            api.getEmployees({ is_active: true, limit: 500, page: 1 }),
          ]);
          if (cancelled) return;
          const raw = settingsRes?.data?.noticePeriodDays ?? settingsRes?.data?.value?.noticePeriodDays;
          const noticeDays = Math.max(0, Number(raw) || 0);
          const minDate = new Date();
          minDate.setDate(minDate.getDate() + noticeDays);
          minDate.setHours(0, 0, 0, 0);
          setApplyLastWorkingDate(toLocalDateString(minDate));
          const list = empRes?.data?.employees ?? empRes?.data ?? [];
          const arr = Array.isArray(list) ? list : [];
          const options = arr
            .filter((e: any) => e.emp_no && !e.leftDate)
            .map((e: any) => ({
              emp_no: e.emp_no,
              name: e.employee_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || e.emp_no,
            }));
          const meta: Record<string, { agreementStartDate?: string; agreementEndDate?: string }> = {};
          arr.forEach((e: any) => {
            if (!e?.emp_no) return;
            const dates = getAgreementDatesFromEmployee(e);
            meta[e.emp_no] = {
              agreementStartDate: dates.startDate,
              agreementEndDate: dates.endDate,
            };
          });
          setApplyEmployeeMeta(meta);
          setApplyEmployees(options);
        }
      } catch (_) {
        if (!cancelled) {
          if (!applySelfOnly) setApplyEmployees([]);
          setApplyEmployeeMeta({});
        }
      } finally {
        if (!cancelled) setApplyModalLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showApplyModal, applySelfOnly]);

  const handleSubmitResignation = async () => {
    if (!applySelectedEmpNo || !applyLastWorkingDate) {
      toast.error(applySelfOnly ? 'Last working date is required.' : 'Please select an employee and ensure last working date is set.');
      return;
    }
    if (applyPendingAssets.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Pending asset return required',
        text: 'This employee still has assigned assets. Please return all assets before submitting resignation.',
      });
      return;
    }
    setApplyLoading(true);
    try {
      if (applyType === 'resignation') {
        const agreementEnd = parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate);
        const lwd = parseDateSafe(applyLastWorkingDate);
        if (agreementEnd && lwd && lwd < agreementEnd) {
          const now = new Date();
          const remainingDays = Math.max(1, Math.ceil((agreementEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
          const result = await Swal.fire({
            icon: 'warning',
            title: 'Agreement period not completed',
            text: `Agreement end date is ${agreementEnd.toLocaleDateString('en-IN')}. It still has around ${remainingDays} day(s). Do you want to continue resignation submission?`,
            showCancelButton: true,
            confirmButtonText: 'Yes, continue',
            cancelButtonText: 'Cancel',
          });
          if (!result.isConfirmed) {
            setApplyLoading(false);
            return;
          }
        }
      }

      const res = await api.createResignationRequest({
        emp_no: applySelectedEmpNo,
        leftDate: applyLastWorkingDate,
        remarks: applyRemarks.trim() || undefined,
        requestType: applyType,
      });
      if (res?.success) {
        Swal.fire({ icon: 'success', title: 'Submitted', text: 'Resignation request submitted successfully.', timer: 2000, showConfirmButton: false });
        setShowApplyModal(false);
        loadData();
      } else {
        Swal.fire({ icon: 'error', title: 'Failed', text: res?.message || 'Submit failed.' });
      }
    } catch (err: unknown) {
      const error = err as { message?: string };
      Swal.fire({ icon: 'error', title: 'Error', text: error?.message || 'Submit failed.' });
    } finally {
      setApplyLoading(false);
    }
  };

  const canPerformAction = (item: ResignationRequest) => {
    if (!currentUser) return false;
    if (item.status !== 'pending') return false;

    const role = (currentUser.role || '').toLowerCase();
    if (['super_admin', 'sub_admin'].includes(role)) return true;

    const nextRole = String(item.workflow?.nextApproverRole || '').toLowerCase().trim();
    if (!nextRole) return false;
    
    // Direct match
    if (role === nextRole) return true;
    if (nextRole === 'final_authority' && role === 'hr') return true;
    if (nextRole === 'reporting_manager') {
      const reportingManagerIds = item.workflow?.reportingManagerIds;
      const userId = currentUser._id || (currentUser as any).id;
      if (reportingManagerIds?.length && userId && reportingManagerIds.some((id: string) => String(id).trim() === String(userId).trim())) return true;
    }

    // Allow Higher Authority logic
    const allowHigher = resignationSettings?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;
    if (allowHigher && item.workflow?.approvalChain) {
      const chain = item.workflow.approvalChain;
      const activeIndex = chain.findIndex(s => s.status === 'pending');
      if (activeIndex !== -1) {
        const userId = currentUser._id || (currentUser as any).id;
        const isReportingManager = item.workflow.reportingManagerIds?.some(id => String(id).trim() === String(userId).trim());
        
        // Look for any LATER step that matches user
        const laterSteps = chain.slice(activeIndex);
        return laterSteps.some(step => {
          const stepRole = (step.role || '').toLowerCase();
          if (stepRole === role) return true;
          if (stepRole === 'reporting_manager' && isReportingManager) return true;
          if (stepRole === 'final_authority' && role === 'hr') return true;
          return false;
        });
      }
    }

    return false;
  };

  const getCurrentStep = useCallback((req: ResignationRequest) => {
    if (!req.workflow?.approvalChain || !currentUser) return null;
    const role = (currentUser.role || '').toLowerCase();
    const userId = currentUser._id || (currentUser as any).id;
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(role);
    
    const allowHigher = resignationSettings?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;
    
    const chain = req.workflow.approvalChain;
    const activeIndex = chain.findIndex(s => s.status === 'pending');
    if (activeIndex === -1) return null;

    if (allowHigher) {
      // Find the LATEST step that matches user, starting from activeIndex
      const laterSteps = chain.slice(activeIndex);
      // We search in reverse to find the "highest" role the user has in the remaining chain
      for (let i = laterSteps.length - 1; i >= 0; i--) {
        const step = laterSteps[i];
        const stepRole = (step.role || '').toLowerCase();
        if (stepRole === 'reporting_manager') {
          const reportingManagerIds = req.workflow?.reportingManagerIds as string[] | undefined;
          if (reportingManagerIds?.some((id: string) => String(id).trim() === userId)) return step;
        }
        if (stepRole === role) return step;
        if (stepRole === 'final_authority' && role === 'hr') return step;
      }
    }

    // Default: find current pending step
    const currentStep = chain[activeIndex];
    const stepRole = (currentStep.role || '').toLowerCase();
    const isReportingManager = req.workflow?.reportingManagerIds?.some((id: string) => String(id).trim() === userId);
    
    const isMatch = isSuperOrSubAdmin || 
      stepRole === role || 
      (stepRole === 'reporting_manager' && isReportingManager) ||
      (stepRole === 'final_authority' && role === 'hr');
    
    return isMatch ? currentStep : null;
  }, [currentUser, resignationSettings]);

  const canEditLWDForRequest = useCallback(
    (req: ResignationRequest | null) => {
      if (!req || !currentUser) return false;
      const role = (currentUser.role || '').toLowerCase();
      if (['super_admin', 'sub_admin'].includes(role)) return true;
      if (req.status === 'approved' && role === 'hr') return true;
      const currentStep = getCurrentStep(req);
      return currentStep?.canEditLWD || false;
    },
    [currentUser, getCurrentStep]
  );

  const canEditLWDCurrentStep = useMemo(
    () => canEditLWDForRequest(selectedRequest),
    [canEditLWDForRequest, selectedRequest]
  );

  const showApprovalFooter =
    !!selectedRequest &&
    selectedRequest.status === 'pending' &&
    canPerformAction(selectedRequest) &&
    canApproveResignation(currentUser as any);

  const handleSaveLWD = async () => {
    if (!selectedRequest || !editableLWD) return;
    
    setSaveLoading(true);
    try {
      const response = await api.updateResignationLWD(selectedRequest._id, {
        newLeftDate: editableLWD,
        comments: actionComment.trim() || undefined
      });
      
      if (response.success) {
        toast.success('Last working date updated successfully');
        setSelectedRequest(response.data);
        setDetailLwdEditMode(false);
        loadData();
      } else {
        toast.error(response.message || 'Failed to update date');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update date');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDetailAction = async (action: 'approve' | 'reject') => {
    if (!selectedRequest) return;
    try {
      const data: any = { action, comments: actionComment };
      // Include new LWD if edited during approval
      if (action === 'approve' && editableLWD && editableLWD !== (selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '')) {
        data.newLeftDate = editableLWD;
      }
      
      const response = await api.approveResignationRequest(selectedRequest._id, data);
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Done',
          text: action === 'approve' ? 'Resignation approved.' : 'Resignation rejected.',
          timer: 2000,
          showConfirmButton: false,
        });
        setShowDetailDialog(false);
        setSelectedRequest(null);
        setActionComment('');
        setDetailLwdEditMode(false);
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: (response as any).message || (response as any).error || 'Action failed',
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Action failed',
      });
    }
  };

  const handleCardAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      const response = await api.approveResignationRequest(id, { action, comments: '' });
      if (response.success) {
        Swal.fire({
          icon: 'success',
          title: 'Done',
          text: action === 'approve' ? 'Resignation approved.' : 'Resignation rejected.',
          timer: 2000,
          showConfirmButton: false,
        });
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Failed',
          text: (response as any).message || (response as any).error || 'Action failed',
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Action failed',
      });
    }
  };

  const filteredAll = useMemo(() => {
    return allRequests.filter(r => {
      const matchSearch = !filters.search || 
        getEmployeeName(r).toLowerCase().includes(filters.search.toLowerCase()) ||
        (r.emp_no || '').toLowerCase().includes(filters.search.toLowerCase());
      const matchDivision = !filters.division_id || r.employeeId?.division_id?._id === filters.division_id;
      const matchDepartment = !filters.department_id || r.employeeId?.department_id?._id === filters.department_id;
      const matchGroup = !filters.employee_group_id || r.employeeId?.employee_group_id?._id === filters.employee_group_id;
      return matchSearch && matchDivision && matchDepartment && matchGroup;
    });
  }, [allRequests, filters]);

  const filteredPendingList = useMemo(() => {
    return pendingRequests.filter(r => {
      const matchSearch = !filters.search || 
        getEmployeeName(r).toLowerCase().includes(filters.search.toLowerCase()) ||
        (r.emp_no || '').toLowerCase().includes(filters.search.toLowerCase());
      const matchDivision = !filters.division_id || r.employeeId?.division_id?._id === filters.division_id;
      const matchDepartment = !filters.department_id || r.employeeId?.department_id?._id === filters.department_id;
      const matchGroup = !filters.employee_group_id || r.employeeId?.employee_group_id?._id === filters.employee_group_id;
      return matchSearch && matchDivision && matchDepartment && matchGroup;
    });
  }, [pendingRequests, filters]);

  const stats = useMemo(
    () => ({
      total: filteredAll.length,
      approved: filteredAll.filter((r) => r.status === 'approved').length,
      pending: filteredAll.filter((r) => r.status === 'pending').length,
      rejected: filteredAll.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length,
      pendingApprovals: filteredPendingList.length,
    }),
    [filteredAll, filteredPendingList]
  );

  const filteredRequests = useMemo(() => {
    const list = activeTab === 'pending' ? filteredPendingList : filteredAll;
    return list.filter((r) => {
      const matchStatus = 
        activeTab === 'all' ? (!filters.status || r.status === filters.status) :
        activeTab === 'approved' ? r.status === 'approved' :
        activeTab === 'rejected' ? ['rejected', 'cancelled'].includes(r.status) :
        activeTab === 'pending' ? (!filters.status || r.status === filters.status) : true;
      return matchStatus;
    });
  }, [filteredAll, filteredPendingList, filters.status, activeTab]);

  if (currentUser && !canViewResignation(currentUser as any)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-lg">
          <LogOut className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-500 mb-4" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Access restricted</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">You do not have permission to view the Resignations page. Contact your administrator if you need access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-10 pt-1">
      <div className="sticky px-2 top-4 z-40 md:px-4 mb-2 md:mb-8">
        <div className="max-w-[1920px] mx-auto md:bg-white/70 md:dark:bg-slate-900/70 md:backdrop-blur-2xl md:rounded-[2.5rem] md:border md:border-white/20 md:dark:border-slate-800 md:shadow-2xl md:shadow-slate-200/50 md:dark:shadow-none min-h-[4.5rem] flex flex-row items-center justify-between gap-4 px-0 sm:px-8 py-2 md:py-0">
          <div className="flex items-center gap-4">
            <div className="hidden md:flex h-10 w-10 rounded-xl bg-gradient-to-br from-green-500 to-green-600 items-center justify-center text-white shadow-lg shadow-green-500/20">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 uppercase tracking-tight whitespace-nowrap">
                Resignations
              </h1>
              <p className="hidden md:flex text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] items-center gap-2">
                Workspace <span className="h-1 w-1 rounded-full bg-slate-300" /> Requested resignations & approvals
              </p>
            </div>
          </div>
          {canApplyResignation(currentUser as any) && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openApplyModal(isEmployeeRole(currentUser), 'resignation')}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-green-500/20 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{isEmployeeRole(currentUser) ? 'Submit resignation' : 'Apply for Resignation'}</span>
                <span className="sm:hidden">{isEmployeeRole(currentUser) ? 'Submit' : 'New'}</span>
              </button>
              {canInitiateTermination(currentUser, resignationSettings) && (
                <button
                  type="button"
                  onClick={() => openApplyModal(false, 'termination')}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-rose-500/20 transition active:scale-95"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Terminate Employee</span>
                  <span className="sm:hidden">Terminate</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-2 sm:px-6">
        {!isEmployeeRole(currentUser) && (
          <>
        <div className="hidden md:grid mb-8 grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total" value={stats.total} icon={ListTodo} bgClass="bg-slate-500/10" iconClass="text-slate-600 dark:text-slate-400" dekorClass="bg-slate-500/5" loading={loading} />
          <StatCard title="Approved" value={stats.approved} icon={CheckCircle2} bgClass="bg-emerald-500/10" iconClass="text-emerald-600 dark:text-emerald-400" dekorClass="bg-emerald-500/5" loading={loading} />
          <StatCard title="Pending" value={stats.pending} icon={Clock3} bgClass="bg-amber-500/10" iconClass="text-amber-600 dark:text-amber-400" dekorClass="bg-amber-500/5" loading={loading} />
          <StatCard title="Pending approvals (you)" value={stats.pendingApprovals} icon={Clock} bgClass="bg-blue-500/10" iconClass="text-blue-600 dark:text-blue-400" dekorClass="bg-blue-500/5" loading={loading} />
        </div>

        <div className="md:hidden grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <LogOut className="w-12 h-12 text-green-500" />
            </div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resignation Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Total</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{loading ? '—' : stats.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Approved</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{loading ? '—' : stats.approved}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Pending</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{loading ? '—' : stats.pending}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Rejected</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{loading ? '—' : stats.rejected}</span>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10">
              <Clock className="w-12 h-12 text-blue-500" />
            </div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Your approvals</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-slate-600 dark:text-slate-400">Pending (you)</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{loading ? '—' : stats.pendingApprovals}</span>
              </div>
            </div>
          </div>
        </div>
          </>
        )}

        <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="md:p-5 md:rounded-[2.5rem] md:border md:border-white/20 md:dark:border-slate-800 md:bg-white/60 md:dark:bg-slate-900/60 md:backdrop-blur-xl md:shadow-xl md:shadow-slate-200/50 md:dark:shadow-none transition-all">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 items-center">
              <div className="col-span-1 sm:col-span-2 lg:col-span-1 xl:col-span-2">
                <div className="relative group">
                  <div className="absolute inset-0 bg-green-500/5 rounded-2xl blur-xl transition-opacity opacity-0 group-focus-within:opacity-100" />
                  <input
                    type="text"
                    placeholder="Search name or emp no..."
                    value={filters.search}
                    onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    className="relative w-full h-10 pl-4 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all dark:text-white shadow-sm"
                  />
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-green-500 transition-colors" />
                </div>
              </div>

              <div className="relative">
                <select
                  value={filters.division_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, division_id: e.target.value, department_id: '' }))}
                  className="w-full h-10 pl-4 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 focus:ring-4 focus:ring-green-500/10 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Divisions</option>
                  {divisions.map((d) => (
                    <option key={d._id} value={d._id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={filters.department_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, department_id: e.target.value }))}
                  className="w-full h-10 pl-4 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 focus:ring-4 focus:ring-green-500/10 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Departments</option>
                  {departments
                    .filter(dep => !filters.division_id || (Array.isArray(dep.divisions) ? dep.divisions.some((div: any) => (typeof div === 'string' ? div : div._id) === filters.division_id) : true))
                    .map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={filters.employee_group_id}
                  onChange={(e) => setFilters((prev) => ({ ...prev, employee_group_id: e.target.value }))}
                  className="w-full h-10 pl-4 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 focus:ring-4 focus:ring-green-500/10 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Groups</option>
                  {groups.map((g) => (
                    <option key={g._id} value={g._id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full h-10 pl-4 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 focus:ring-4 focus:ring-green-500/10 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-inner w-full sm:w-auto gap-1 sm:gap-0">
            {[
              { id: 'all' as const, label: 'All requests', icon: ListTodo, count: stats.total, activeColor: 'green' },
              { id: 'pending' as const, label: 'Pending for you', icon: Clock3, count: stats.pendingApprovals, activeColor: 'orange' },
              { id: 'approved' as const, label: 'Approved', icon: CheckCircle2, count: stats.approved, activeColor: 'green' },
              { id: 'rejected' as const, label: 'Rejected', icon: X, count: stats.rejected, activeColor: 'red' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex items-center justify-center gap-2 px-2 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-white dark:bg-slate-700 shadow-sm ring-1 ring-slate-200/50 dark:ring-0 ' + (tab.activeColor === 'green' ? 'text-green-600 dark:text-green-400' : tab.activeColor === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400')
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? (tab.activeColor === 'green' ? 'text-green-600 dark:text-green-400' : tab.activeColor === 'orange' ? 'text-orange-600 dark:text-orange-400' : 'text-rose-600 dark:text-rose-400') : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${activeTab === tab.id
                    ? (tab.activeColor === 'green' ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300' : tab.activeColor === 'orange' ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300')
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {!isEmployeeRole(currentUser) && (
            <div className="flex items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm self-end sm:self-auto">
              <button
                onClick={() => setViewType('list')}
                className={`p-2 rounded-lg transition-all ${viewType === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-green-600 dark:text-green-400' : 'text-slate-400 hover:text-slate-600'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewType('card')}
                className={`p-2 rounded-lg transition-all ${viewType === 'card' ? 'bg-white dark:bg-slate-700 shadow-sm text-green-600 dark:text-green-400' : 'text-slate-400 hover:text-slate-600'}`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 animate-pulse ${viewType === 'list' ? 'h-16' : 'h-40'}`} />
              ))}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              No resignation requests found in this section.
            </div>
          ) : viewType === 'list' && !isEmployeeRole(currentUser) ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Employee</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Type</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Applied</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Organization</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">LWD</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-center">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRequests.map((req) => (
                    <tr key={req._id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            req.status === 'approved' ? 'bg-green-100 text-green-600 dark:bg-green-900/30' : 
                            req.status === 'pending' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'
                          }`}>
                            {getEmployeeInitials(req)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm whitespace-nowrap">{getEmployeeName(req)}</div>
                            <div className="text-[10px] text-slate-400 font-bold tracking-tighter uppercase">{req.emp_no}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {req.requestType === 'termination' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/20 text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800/30 uppercase tracking-tighter">
                            <X className="w-2.5 h-2.5" /> Termination
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30 uppercase tracking-tighter">
                            <LogOut className="w-2.5 h-2.5" /> Resignation
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(req.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                          {req.employeeId?.division_id?.name || '—'}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase border border-slate-100 dark:border-slate-800 px-1 rounded bg-slate-50/50 dark:bg-slate-800/50 truncate max-w-[80px]">
                            {req.employeeId?.department_id?.name || '—'}
                          </span>
                          <span className="text-[9px] text-slate-500 font-black uppercase border border-slate-200 dark:border-slate-700 px-1 rounded bg-slate-100 dark:bg-slate-800 truncate max-w-[80px]">
                            {req.employeeId?.employee_group_id?.name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(req.leftDate, req.isLwdManual, req.status)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold tracking-tight ${getStatusColor(getStatusVisualKey(req))}`}>
                          {getDisplayStatusText(req)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequest(req);
                            setActionComment('');
                            setEditableLWD(req.leftDate ? req.leftDate.split('T')[0] : '');
                            setDetailLwdEditMode(false);
                            setShowDetailDialog(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all tracking-tighter"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        {activeTab === 'pending' && canPerformAction(req) && canApproveResignation(currentUser as any) && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleCardAction(req._id, 'approve')}
                              className="p-1.5 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white transition-all"
                              title="Approve"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCardAction(req._id, 'reject')}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white transition-all"
                              title="Reject"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                         )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredRequests.map((req) => (
                <div
                  key={req._id}
                  className={`group relative flex flex-col justify-between rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900 ${
                    req.status === 'pending' ? 'hover:border-orange-200/60' : 'hover:border-green-200/60'
                  }`}
                >
                  <div className={`absolute top-0 left-0 w-1 h-full rounded-l-2xl group-hover:w-1.5 transition-all ${
                    req.status === 'pending' ? 'bg-orange-500/80' : 'bg-green-500/80'
                  }`} />
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold dark:bg-green-900/30 dark:text-green-400 ${
                        req.status === 'pending' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {getEmployeeInitials(req)}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900 dark:text-white line-clamp-1">{getEmployeeName(req)}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{req.emp_no}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold ${getStatusColor(getStatusVisualKey(req))}`}>
                        {getDisplayStatusText(req)}
                      </span>
                      {req.requestType === 'termination' && (
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                          Termination
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Applied on</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(req.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {req.requestType === 'termination' ? 'Termination date' : 'Last working date'}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(req.leftDate, req.isLwdManual, req.status)}</span>
                    </div>
                    {req.remarks && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{req.remarks}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequest(req);
                        setActionComment('');
                        setEditableLWD(req.leftDate ? req.leftDate.split('T')[0] : '');
                        setDetailLwdEditMode(false);
                        setShowDetailDialog(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    {activeTab === 'pending' && canPerformAction(req) && canApproveResignation(currentUser as any) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCardAction(req._id, 'approve')}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-500/10 py-2 text-sm font-semibold text-green-600 transition-colors hover:bg-green-500 hover:text-white dark:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500 dark:hover:text-white"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCardAction(req._id, 'reject')}
                          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-500/10 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => !applyLoading && setShowApplyModal(false)} />
          <div className="relative z-50 w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {applyType === 'termination' ? (
                  <>
                    <X className="w-5 h-5 text-rose-500" />
                    Terminate Employee
                  </>
                ) : (
                  <>
                    <LogOut className="w-5 h-5 text-green-500" />
                    {applySelfOnly ? 'Submit resignation' : 'Apply for Resignation'}
                  </>
                )}
              </h2>
              <button type="button" onClick={() => !applyLoading && setShowApplyModal(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            {applyModalLoading ? (
              <div className="py-8 text-center text-slate-500">Loading...</div>
            ) : (
              <div className="space-y-4">
                {!applySelfOnly && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Search Employee</label>
                  <input
                    type="text"
                    value={applyEmployeeSearch}
                    onChange={(e) => {
                      setApplyEmployeeSearch(e.target.value);
                      if (applySelectedEmpNo) setApplySelectedEmpNo('');
                    }}
                    placeholder="Search by name or employee ID..."
                    className="mb-3 w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm font-medium text-slate-900 dark:text-white focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all"
                  />
                  {applyEmployeeSearch.trim() && !applySelectedEmpNo && (
                    <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      {filteredApplyEmployees.length > 0 ? (
                        filteredApplyEmployees.map((emp) => (
                          <button
                            key={emp.emp_no}
                            type="button"
                            onClick={() => {
                              setApplySelectedEmpNo(emp.emp_no);
                              setApplyEmployeeSearch(`${emp.name} (${emp.emp_no})`);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <span className="font-medium">{emp.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{emp.emp_no}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No employees found</p>
                      )}
                    </div>
                  )}
                </div>
                )}

                {canInitiateTermination(currentUser, resignationSettings) && !applySelfOnly && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Request Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleApplyTypeChange('resignation')}
                      className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                        applyType === 'resignation'
                          ? 'bg-green-500/10 border-green-500 text-green-700 dark:text-green-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <LogOut className="w-4 h-4" />
                      Resignation
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyTypeChange('termination')}
                      className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                        applyType === 'termination'
                          ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      <X className="w-4 h-4" />
                      Termination
                    </button>
                  </div>
                </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    {applyType === 'termination' ? 'Reason for termination' : 'Remarks for resignation'}
                  </label>
                  <textarea
                    value={applyRemarks}
                    onChange={(e) => setApplyRemarks(e.target.value)}
                    placeholder="Optional remarks..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    {applyType === 'termination' ? 'Termination date' : 'Last working date'}
                  </label>
                  <div className="flex items-center gap-2 h-11 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-sm font-medium">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>{applyLastWorkingDate ? new Date(applyLastWorkingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {applyType === 'termination' 
                      ? 'Employee will be deactivated on this date. By default set to today.' 
                      : 'Auto-set from notice period; last day in office.'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Agreement period</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-slate-400">Start date</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedApplyEmployeeAgreement.agreementStartDate ? new Date(selectedApplyEmployeeAgreement.agreementStartDate).toLocaleDateString('en-IN') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">End date</p>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedApplyEmployeeAgreement.agreementEndDate ? new Date(selectedApplyEmployeeAgreement.agreementEndDate).toLocaleDateString('en-IN') : '—'}</p>
                    </div>
                  </div>
                  {applyType === 'resignation' &&
                    parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate) &&
                    parseDateSafe(applyLastWorkingDate) &&
                    parseDateSafe(applyLastWorkingDate)! < parseDateSafe(selectedApplyEmployeeAgreement.agreementEndDate)! && (
                      <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        Agreement end date is still pending. You will see a confirmation warning before submitting this resignation.
                      </p>
                    )}
                </div>
                {applySelectedEmpNo && (
                  <div className={`rounded-xl border p-3 ${
                    applyPendingAssets.length > 0
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
                      : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                  }`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Asset return status
                    </p>
                    {applyPendingAssetsLoading ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Checking pending assets...</p>
                    ) : applyPendingAssets.length > 0 ? (
                      <>
                        <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          {applyPendingAssets.length} asset{applyPendingAssets.length > 1 ? 's are' : ' is'} still assigned. Return required before resignation.
                        </p>
                        <div className="mt-2 max-h-24 space-y-1 overflow-y-auto rounded-lg border border-amber-200/60 bg-white/70 px-2 py-2 text-xs dark:border-amber-900/40 dark:bg-slate-900/50">
                          {applyPendingAssets.map((item: any) => (
                            <p key={item._id} className="text-slate-700 dark:text-slate-200">
                              - {item?.asset?.name || 'Asset'} ({item?.asset?.visibilityScope === 'division' ? 'Division scoped' : 'Universal'})
                            </p>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        No pending assets. Resignation can be submitted.
                      </p>
                    )}
                  </div>
                )}
                {applyType === 'termination' && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed font-medium">
                      <strong>Warning:</strong> Termination will deactivate the employee account immediately upon final approval if the date is today or earlier.
                    </p>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => !applyLoading && setShowApplyModal(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    Cancel
                  </button>
                  <button type="button" onClick={handleSubmitResignation} disabled={applyLoading || !applySelectedEmpNo || !applyLastWorkingDate} className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg flex items-center justify-center gap-2 ${
                    applyType === 'termination' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' : 'bg-green-600 hover:bg-green-700 shadow-green-500/20'
                  }`}>
                    {applyLoading ? 'Submitting...' : (applyType === 'termination' ? 'Confirm Termination' : (applySelfOnly ? 'Submit resignation' : 'Submit Resignation'))}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showDetailDialog && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => { setShowDetailDialog(false); setSelectedRequest(null); setDetailLwdEditMode(false); }} />
          <div className="relative z-50 w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white min-w-0">
                {selectedRequest.requestType === 'termination' ? 'Termination request' : 'Resignation request'}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                {canEditLWDCurrentStep && !detailLwdEditMode && (
                  <button
                    type="button"
                    onClick={() => setDetailLwdEditMode(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-900/50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                {canEditLWDCurrentStep && detailLwdEditMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailLwdEditMode(false);
                      setEditableLWD(selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '');
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setShowDetailDialog(false); setSelectedRequest(null); setDetailLwdEditMode(false); }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{getEmployeeName(selectedRequest)}</h3>
                <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${getStatusColor(getStatusVisualKey(selectedRequest))}`}>{getDisplayStatusText(selectedRequest)}</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-500 dark:text-slate-400">Employee ID: {selectedRequest.emp_no}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Division</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.division_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Department</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.department_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Designation</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(selectedRequest.employeeId as any)?.designation_id?.name || '—'}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-slate-400">Employee Group</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedRequest.employeeId?.employee_group_id?.name || '—'}</p></div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-3">
                <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Date of joining</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatDateDash(selectedRequest.employeeId?.doj)}</p></div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-500">{selectedRequest.requestType === 'termination' ? 'Termination date' : 'Last working date'}</p>
                    {canEditLWDCurrentStep && detailLwdEditMode ? (
                      <div className="mt-0.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={editableLWD || (selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '')}
                            onChange={(e) => setEditableLWD(e.target.value)}
                            className="h-9 max-w-full rounded-lg border border-amber-200 bg-white px-2 text-sm font-medium text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-200 dark:border-amber-800 dark:bg-slate-800 dark:text-white dark:focus:border-amber-500 dark:focus:ring-amber-900/40"
                          />
                          {editableLWD && editableLWD !== (selectedRequest.leftDate ? selectedRequest.leftDate.split('T')[0] : '') && (
                            <button
                              type="button"
                              onClick={handleSaveLWD}
                              disabled={saveLoading}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
                              title="Save last working date"
                            >
                              {saveLoading ? (
                                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                              Save
                            </button>
                          )}
                        </div>
                        {!showApprovalFooter && (
                          <textarea
                            value={actionComment}
                            onChange={(e) => setActionComment(e.target.value)}
                            placeholder="Optional note for this date change…"
                            rows={2}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 resize-none"
                          />
                        )}
                      </div>
                    ) : (
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatDateDash(selectedRequest.leftDate)}</p>
                    )}
                  </div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Agreement start date</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(() => { const d = getAgreementDatesFromEmployee(selectedRequest.employeeId); return formatDateDash(d.startDate); })()}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-slate-500">Agreement end date</p><p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{(() => { const d = getAgreementDatesFromEmployee(selectedRequest.employeeId); return formatDateDash(d.endDate); })()}</p></div>
                </div>
                {selectedRequest.lwdHistory && selectedRequest.lwdHistory.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LWD change history</p>
                    <div className="mt-2 space-y-2">
                      {selectedRequest.lwdHistory.map((history, idx) => (
                        <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0">
                          <div className="flex flex-wrap justify-between gap-1 font-bold text-slate-700 dark:text-slate-300">
                            <span>{formatDate(history.oldDate, true)} → {formatDate(history.newDate, true)}</span>
                            <span className="opacity-60 font-medium">{(history as { timestampIST?: string }).timestampIST || formatDateTime(history.timestamp)}</span>
                          </div>
                          <p className="mt-0.5">Changed by <span className="font-semibold">{history.updatedByName}</span> ({history.updatedByRole})</p>
                          {history.comments && <p className="mt-1 italic opacity-80">&quot;{history.comments}&quot;</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRequest.remarks && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Reason / Remarks</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedRequest.remarks}</p>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Requested by</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{selectedRequest.requestedBy?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Requested on</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatDateTime(selectedRequest.createdAt)}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Approval History</h3>
                {selectedRequest.workflow?.approvalChain && selectedRequest.workflow.approvalChain.length > 0 ? (
                  <div className="space-y-3">
                    {selectedRequest.workflow.approvalChain.map((step, idx) => {
                      const isPending = !step.status || step.status === 'pending';
                      const isRejected = step.status === 'rejected';
                      const isApproved = step.status === 'approved';
                      return (
                        <div key={idx} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 ml-1 pb-4 last:pb-0">
                          <div className={`absolute -left-[9px] top-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm ${isApproved ? 'bg-green-500' : isRejected ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{step.label || step.role}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${isApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : isRejected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500'}`}>{step.status || 'pending'}</span>
                            </div>
                            {!isPending && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                <p>By: <span className="font-semibold text-slate-700 dark:text-slate-200">{step.actionByName || '—'}</span></p>
                                <p className="mt-0.5">Action date: <span className="font-semibold text-slate-700 dark:text-slate-200">{step.updatedAtIST || formatDateTime(step.updatedAt)}</span></p>
                                {step.comments && <p className="mt-1 italic border-l-2 border-slate-200 dark:border-slate-700 pl-2">&quot;{step.comments}&quot;</p>}
                              </div>
                            )}
                            {isPending && <p className="text-[11px] text-slate-500 dark:text-slate-400">Action date: <span className="font-semibold text-slate-700 dark:text-slate-200">Awaiting approval</span></p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-slate-500 dark:text-slate-400">No approval history available.</p>}
              </div>
            </div>

            {showApprovalFooter && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3">
                <div className="grid gap-2 grid-cols-1">
                  <textarea
                    value={actionComment}
                    onChange={(e) => setActionComment(e.target.value)}
                    placeholder="Add a comment (optional)…"
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDetailAction('approve')}
                    className={`flex-1 py-2 text-white text-sm font-bold rounded-lg ${
                      selectedRequest.requestType === 'termination' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {selectedRequest.requestType === 'termination' ? 'Consent' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDetailAction('reject')}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} newestOnTop={false} closeOnClick pauseOnFocusLoss draggable pauseOnHover theme="light" />
    </div>
  );
}
