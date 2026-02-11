'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { auth } from '@/lib/auth';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus,
  Check,
  X,
  Calendar,
  Briefcase,
  Clock3,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Search,
  Filter,
  Eye,
  AlertCircle,
  Clock,
  ChevronRight,
  RotateCw
} from 'lucide-react';
import WorkflowTimeline from '@/components/WorkflowTimeline';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Swal from 'sweetalert2';

// Premium Stat Card
const StatCard = ({ title, value, icon: Icon, bgClass, iconClass, dekorClass, trend }: { title: string, value: number | string, icon: any, bgClass: string, iconClass: string, dekorClass?: string, trend?: { value: string, positive: boolean } }) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{title}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
          {trend && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${trend.positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
              {trend.value}
            </span>
          )}
        </div>
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgClass} ${iconClass}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
    {dekorClass && <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${dekorClass}`} />}
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isPending = !isApproved && !isRejected;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isApproved ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
        isRejected ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
          'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-emerald-500' : isRejected ? 'bg-red-500' : 'bg-amber-500'}`} />
      {status}
    </span>
  );
};

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department?: { _id: string; name: string };
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
}

interface CCLRequest {
  _id: string;
  employeeId: Employee;
  emp_no: string;
  date: string;
  isHalfDay: boolean;
  halfDayType?: 'first_half' | 'second_half' | null;
  inTime?: string | null;
  outTime?: string | null;
  totalHours?: number | null;
  attendanceNote?: string | null;
  assignedBy: User;
  purpose: string;
  status: string;
  appliedBy: { name: string; email: string };
  appliedAt: string;
  workflow?: {
    approvalChain: Array<{ stepOrder: number; role: string; label: string; status: string }>;
    nextApproverRole: string;
  };
}

const formatDate = (d: string) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (t: string | Date | null) => {
  if (!t) return '-';
  return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export default function CCLPage() {
  const { user } = useAuth();
  const currentUser = auth.getUser();

  const isManagement = currentUser && ['manager', 'hod', 'hr', 'super_admin', 'sub_admin'].includes(currentUser.role);

  const canApplyCCLForSelf = !!currentUser;
  const canApplyCCLForOthers = !!isManagement;

  const [activeTab, setActiveTab] = useState<'my' | 'pending'>('my');
  const [loading, setLoading] = useState(false);
  const [myCCLs, setMyCCLs] = useState<CCLRequest[]>([]);
  const [pendingCCLs, setPendingCCLs] = useState<CCLRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedCCL, setSelectedCCL] = useState<CCLRequest | null>(null);

  const [actionModal, setActionModal] = useState<{ cclId: string; action: 'approve' | 'reject' } | null>(null);
  const [actionComment, setActionComment] = useState('');

  const [employees, setEmployees] = useState<{ _id: string; emp_no: string; employee_name: string }[]>([]);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    isHalfDay: false,
    halfDayType: null as 'first_half' | 'second_half' | null,
    assignedBy: '',
    purpose: '',
    empNo: '',
    employeeId: '',
  });
  const [assignedByUsers, setAssignedByUsers] = useState<User[]>([]);
  const [dateValid, setDateValid] = useState<boolean | null>(null);
  const [dateValidationMessage, setDateValidationMessage] = useState<string>('');

  const stats = useMemo(() => {
    const counts = {
      my: { approved: 0, pending: 0, rejected: 0 },
      pendingApproval: pendingCCLs.length,
      total: { approved: 0, pending: 0, rejected: 0 }
    };

    myCCLs.forEach(ccl => {
      const status = ccl.status?.toLowerCase();
      if (status === 'approved') counts.my.approved++;
      else if (status === 'rejected') counts.my.rejected++;
      else counts.my.pending++;

      if (status === 'approved') counts.total.approved++;
      else if (status === 'rejected') counts.total.rejected++;
      else counts.total.pending++;
    });

    return counts;
  }, [myCCLs, pendingCCLs]);

  const loadData = async () => {
    setLoading(true);
    try {
      const role = currentUser?.role;
      const isEmployee = role === 'employee';

      if (isEmployee) {
        const [myRes, pendingRes] = await Promise.all([
          api.getMyCCLs(),
          api.getPendingCCLApprovals(),
        ]);
        if (myRes.success) setMyCCLs(myRes.data || []);
        if (pendingRes.success) setPendingCCLs(pendingRes.data || []);
      } else {
        const [cclsRes, pendingRes] = await Promise.all([
          api.getCCLs({ limit: 500 }),
          api.getPendingCCLApprovals(),
        ]);
        if (cclsRes.success) setMyCCLs(cclsRes.data || []);
        if (pendingRes.success) setPendingCCLs(pendingRes.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      if (!currentUser) return;

      if (currentUser.role === 'employee') {
        const identifier = (currentUser as any).emp_no || currentUser.employeeId;
        if (identifier) {
          const r = await api.getEmployee(identifier);
          if (r.success && r.data) setEmployees([r.data]);
          else setEmployees([]);
        } else setEmployees([]);
      } else {
        const query: any = { is_active: true };
        if (currentUser.role === 'hod') {
          const deptId = typeof currentUser.department === 'object' && currentUser.department ? (currentUser.department as any)._id : currentUser.department;
          if (deptId) query.department_id = deptId;
        }
        const r = await api.getEmployees(query);
        if (r.success && Array.isArray(r.data)) setEmployees(r.data || []);
        else setEmployees([]);
      }
    } catch (e) {
      console.error(e);
      setEmployees([]);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (currentUser && showForm) loadEmployees();
  }, [currentUser, showForm]);

  // Resolve employee: selected for on-behalf, or self
  const resolvedEmpNo = formData.empNo || (user as any)?.emp_no || (user as any)?.employeeId;
  const resolvedEmpId = formData.employeeId || (user as any)?.employeeRef;

  useEffect(() => {
    if (!showForm || (!resolvedEmpNo && !resolvedEmpId)) return;
    api.getCCLAssignedByUsers({ employeeId: resolvedEmpId || undefined, empNo: resolvedEmpNo || undefined }).then((r) => {
      if (r.success) setAssignedByUsers(r.data || []);
    });
  }, [showForm, resolvedEmpId, resolvedEmpNo]);

  useEffect(() => {
    if (!formData.date || (!resolvedEmpNo && !resolvedEmpId)) {
      setDateValid(null);
      setDateValidationMessage('');
      return;
    }
    api
      .validateCCLDate(formData.date, {
        employeeId: resolvedEmpId || undefined,
        empNo: resolvedEmpNo || undefined,
        isHalfDay: formData.isHalfDay,
        halfDayType: formData.halfDayType || undefined,
      })
      .then((r: any) => {
        setDateValid(r.valid);
        setDateValidationMessage(r.message || '');
      })
      .catch(() => { setDateValid(false); setDateValidationMessage('Validation failed'); });
  }, [formData.date, formData.isHalfDay, formData.halfDayType, resolvedEmpId, resolvedEmpNo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assignedBy || !formData.purpose.trim()) return;
    if (dateValid === false) {
      alert(dateValidationMessage || 'Selected date is not valid. It must be a holiday/week-off and no existing CCL for that day.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.applyCCL({
        date: formData.date,
        isHalfDay: formData.isHalfDay,
        halfDayType: formData.isHalfDay ? formData.halfDayType || undefined : undefined,
        assignedBy: formData.assignedBy,
        purpose: formData.purpose.trim(),
        ...(formData.employeeId ? { employeeId: formData.employeeId } : formData.empNo ? { empNo: formData.empNo } : {}),
      });
      if (res.success) {
        setShowForm(false);
        setFormData({
          date: new Date().toISOString().split('T')[0],
          isHalfDay: false,
          halfDayType: null,
          assignedBy: '',
          purpose: '',
          empNo: '',
          employeeId: '',
        });
        loadData();
      } else {
        alert(res.error || 'Failed to submit');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const canPerformAction = (ccl: CCLRequest) => {
    const u = user as any;
    if (!u?.role) return false;
    const next = ccl.workflow?.nextApproverRole;
    if (!next) return false;
    return next === u.role || (next === 'final_authority' && u.role === 'hr');
  };

  const openActionModal = (id: string, action: 'approve' | 'reject') => {
    setActionModal({ cclId: id, action });
    setActionComment('');
  };

  const handleActionSubmit = async () => {
    if (!actionModal) return;
    setLoading(true);
    try {
      const res = await api.processCCLAction(actionModal.cclId, actionModal.action, actionComment.trim() || undefined);
      if (res.success) {
        setActionModal(null);
        setActionComment('');
        setSelectedCCL(null);
        loadData();
      } else alert(res.error || 'Action failed');
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const list = activeTab === 'my' ? myCCLs : pendingCCLs;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-10">
      {/* Sticky Header */}
      <div className="sticky top-4 z-40 px-4 mb-8">
        <div className="max-w-[1920px] mx-auto bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl rounded-[2.5rem] border border-white/20 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none min-h-[4.5rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 sm:px-8 py-4 sm:py-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 uppercase tracking-tight">
                Compensatory Leave
              </h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                Workspace <span className="h-1 w-1 rounded-full bg-slate-300"></span> Leave Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {(canApplyCCLForSelf || canApplyCCLForOthers) && (
              <button
                onClick={() => setShowForm(true)}
                className="group h-11 sm:h-10 px-6 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-slate-900/10 dark:shadow-white/10"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Apply CCL</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-6">
        {/* Toast Container */}
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Approved CCLs"
            value={stats.my.approved}
            icon={CheckCircle2}
            bgClass="bg-emerald-500/10"
            iconClass="text-emerald-600 dark:text-emerald-400"
            dekorClass="bg-emerald-500/5"
          />
          <StatCard
            title="Pending My CCL"
            value={stats.my.pending}
            icon={Clock3}
            bgClass="bg-amber-500/10"
            iconClass="text-amber-600 dark:text-amber-400"
            dekorClass="bg-amber-500/5"
          />
          <StatCard
            title="Rejected CCLs"
            value={stats.my.rejected}
            icon={XCircle}
            bgClass="bg-rose-500/10"
            iconClass="text-rose-600 dark:text-rose-400"
            dekorClass="bg-rose-500/5"
          />
          <StatCard
            title="Pending Approvals"
            value={stats.pendingApproval}
            icon={ShieldCheck}
            bgClass="bg-indigo-500/10"
            iconClass="text-indigo-600 dark:text-indigo-400"
            dekorClass="bg-indigo-500/5"
          />
        </div>

        {/* Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-inner overflow-x-auto scrollbar-hide">
            {[
              { id: 'my', label: 'My CCL', icon: Calendar, count: myCCLs.length, activeColor: 'blue' },
              { id: 'pending', label: 'Pending Approvals', icon: Clock3, count: pendingCCLs.length, activeColor: 'orange' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`group relative flex items-center gap-2 px-4 sm:px-6 py-2 rounded-lg text-xs font-bold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                  ? `bg-white dark:bg-slate-700 text-${tab.id === 'my' ? 'blue' : 'orange'}-600 dark:text-${tab.id === 'my' ? 'blue' : 'orange'}-400 shadow-sm ring-1 ring-slate-200/50 dark:ring-0`
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
              >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? `text-${tab.id === 'my' ? 'blue' : 'orange'}-600 dark:text-${tab.id === 'my' ? 'blue' : 'orange'}-400` : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${activeTab === tab.id
                    ? `bg-${tab.id === 'my' ? 'blue' : 'orange'}-50 text-${tab.id === 'my' ? 'blue' : 'orange'}-600 dark:bg-${tab.id === 'my' ? 'blue' : 'orange'}-900/30 dark:text-${tab.id === 'my' ? 'blue' : 'orange'}-300`
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          {loading && list.length === 0 ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto scrollbar-hide">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                  <tr>
                    <th scope="col" className="py-4 pl-6 pr-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Employee</th>
                    <th scope="col" className="px-3 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Date</th>
                    <th scope="col" className="px-3 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Type</th>
                    <th scope="col" className="px-3 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Assigned By</th>
                    <th scope="col" className="px-3 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Purpose</th>
                    <th scope="col" className="px-3 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Status</th>
                    <th scope="col" className="relative py-4 pl-3 pr-6 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900/50">
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-12 w-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                            <AlertCircle className="w-6 h-6 text-slate-300" />
                          </div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No CCL requests found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    list.map((ccl) => (
                      <tr
                        key={ccl._id}
                        className="group cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                        onClick={() => setSelectedCCL(ccl)}
                      >
                        <td className="whitespace-nowrap py-4 pl-6 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 font-black text-xs">
                              {(ccl.employeeId?.employee_name || ccl.emp_no).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-900 dark:text-white transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{ccl.employeeId?.employee_name || ccl.emp_no}</div>
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{ccl.emp_no}</div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{formatDate(ccl.date)}</span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compensatory Day</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${ccl.isHalfDay ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                            {ccl.isHalfDay ? `Half (${ccl.halfDayType || '-'})` : 'Full Day'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                              <ShieldCheck className="w-3 h-3 text-slate-400" />
                            </div>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{ccl.assignedBy?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <p className="max-w-[200px] truncate text-xs font-medium text-slate-600 dark:text-slate-400">{ccl.purpose}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <StatusBadge status={ccl.status} />
                        </td>
                        <td className="whitespace-nowrap py-4 pl-3 pr-6 text-right">
                          <div className="flex justify-end gap-2">
                            {activeTab === 'pending' && canPerformAction(ccl) && (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => openActionModal(ccl._id, 'approve')}
                                  className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center"
                                  title="Approve"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => openActionModal(ccl._id, 'reject')}
                                  className="h-8 w-8 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"
                                  title="Reject"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                            <button className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all flex items-center justify-center">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Apply Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowForm(false)} />
          <div className="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-slate-800 shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-300">
            <div className="mb-8">
              <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                Apply CCL
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Compensatory leave for holiday/week-off work.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {canApplyCCLForOthers && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Employee (on behalf)</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => {
                      const val = e.target.value;
                      const emp = employees.find((x) => x._id === val);
                      setFormData((p) => ({ ...p, employeeId: val || '', empNo: emp?.emp_no || '' }));
                    }}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Self</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>{emp.employee_name} ({emp.emp_no})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Date *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  {dateValid !== null && (
                    <p className={`text-[10px] font-bold ${dateValid ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {dateValidationMessage || (dateValid ? 'Valid holiday/week-off' : 'Not a valid date')}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Assigned By *</label>
                  <select
                    value={formData.assignedBy}
                    onChange={(e) => setFormData((p) => ({ ...p, assignedBy: e.target.value }))}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  >
                    <option value="">Select User</option>
                    {assignedByUsers.map((u) => (
                      <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Work Duration</label>
                <div className="inline-flex w-full p-1 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, isHalfDay: false, halfDayType: null }))}
                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!formData.isHalfDay
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                  >
                    Full Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, isHalfDay: true }))}
                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${formData.isHalfDay
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                      }`}
                  >
                    Half Day
                  </button>
                </div>
              </div>

              {formData.isHalfDay && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Half Selection</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, halfDayType: 'first_half' }))}
                      className={`h-11 rounded-xl border font-bold text-xs transition-all ${formData.halfDayType === 'first_half'
                        ? 'border-indigo-500 bg-indigo-50/50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : 'border-slate-200 text-slate-500 dark:border-slate-700'
                        }`}
                    >
                      First Half
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, halfDayType: 'second_half' }))}
                      className={`h-11 rounded-xl border font-bold text-xs transition-all ${formData.halfDayType === 'second_half'
                        ? 'border-indigo-500 bg-indigo-50/50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                        : 'border-slate-200 text-slate-500 dark:border-slate-700'
                        }`}
                    >
                      Second Half
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Purpose / Reason *</label>
                <textarea
                  value={formData.purpose}
                  onChange={(e) => setFormData((p) => ({ ...p, purpose: e.target.value }))}
                  rows={3}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-xs font-medium transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Explain the reason for compensatory leave..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-11 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Apply Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedCCL && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedCCL(null)} />
          <div className="relative z-50 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="shrink-0 px-6 py-4 sm:px-8 sm:py-6 border-b border-white/10 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black uppercase tracking-wider">CCL Detail</h2>
                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Workspace Management</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCCL(null)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-8">
              {/* Employee & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center font-black text-lg">
                    {(selectedCCL.employeeId?.employee_name || selectedCCL.emp_no).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{selectedCCL.employeeId?.employee_name || selectedCCL.emp_no}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedCCL.emp_no}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={selectedCCL.status} />
                  <div className="flex items-center gap-1.5 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                    <Clock3 className="w-3.5 h-3.5" />
                    Applied {formatDate(selectedCCL.appliedAt)}
                  </div>
                </div>
              </div>

              {/* Grid Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <Calendar className="w-3 h-3" /> Event Date
                    </span>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDate(selectedCCL.date)}</p>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <Clock className="w-3 h-3" /> Type & Duration
                    </span>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      {selectedCCL.isHalfDay ? `Half Day (${selectedCCL.halfDayType || '-'})` : 'Full Day'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <ShieldCheck className="w-3 h-3" /> Assigned By
                    </span>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selectedCCL.assignedBy?.name || '-'}</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 flex items-center gap-2">
                      <RotateCw className="w-3 h-3" /> Attendance Context
                    </span>
                    <div className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <p>In: {formatTime(selectedCCL.inTime || null)}</p>
                      <p>Out: {formatTime(selectedCCL.outTime || null)}</p>
                      <p>Duration: {selectedCCL.totalHours != null ? `${selectedCCL.totalHours}h` : '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Purpose / Detailed Reason</span>
                <p className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700/60 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {selectedCCL.purpose}
                </p>
              </div>

              {selectedCCL.attendanceNote && (
                <div className="space-y-1.5 animate-pulse">
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-500 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" /> Attendance Note
                  </span>
                  <p className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-700/50 text-[11px] font-medium text-amber-700 dark:text-amber-300 italic">
                    {selectedCCL.attendanceNote}
                  </p>
                </div>
              )}
            </div>

            {selectedCCL.workflow?.approvalChain?.length ? (
              <div className="mt-4 shrink-0 px-6 sm:px-8 py-6 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="mb-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Approval Workflow</div>
                <WorkflowTimeline workflow={selectedCCL.workflow as any} />
              </div>
            ) : null}

            {/* Sticky Footer */}
            <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row gap-3 justify-end items-stretch sm:items-center">
              {activeTab === 'pending' && canPerformAction(selectedCCL) && (
                <div className="flex gap-2 flex-1 sm:flex-none">
                  <button
                    onClick={() => { setSelectedCCL(null); openActionModal(selectedCCL._id, 'approve'); }}
                    className="flex-1 sm:flex-none h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setSelectedCCL(null); openActionModal(selectedCCL._id, 'reject'); }}
                    className="flex-1 sm:flex-none h-10 px-6 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
              <button
                onClick={() => setSelectedCCL(null)}
                className="h-10 px-6 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve/Reject Comment Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm" onClick={() => setActionModal(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {actionModal.action === 'approve' ? 'Approve CCL' : 'Reject CCL'}
              </h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {actionModal.action === 'approve' ? 'Comments (optional)' : 'Reason (optional)'}
              </label>
              <textarea
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={actionModal.action === 'approve' ? 'Add a comment...' : 'Add a reason...'}
                rows={3}
                autoFocus
                className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setActionModal(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                  Cancel
                </button>
                <button
                  onClick={handleActionSubmit}
                  disabled={loading}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${actionModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                    }`}
                >
                  {loading ? 'Processing...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
