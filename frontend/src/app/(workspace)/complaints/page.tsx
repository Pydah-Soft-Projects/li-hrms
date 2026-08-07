'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  AlertTriangle,
  Plus,
  X,
  Search,
  Check,
  Image as ImageIcon,
  Send,
  Loader2,
  Calendar,
  ChevronRight,
  User,
  Trash2,
  XCircle,
  CheckCircle,
  Clock,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { api, Employee } from '@/lib/api';
import { auth, User as AuthUser } from '@/lib/auth';
import EmployeeSelect from '@/components/EmployeeSelect';

export default function ComplaintsPage() {
  const pathname = usePathname();
  const isSuperAdminRoute = pathname?.includes('/superadmin');

  const themeStyles = isSuperAdminRoute ? {
    '--ps-accent': '#10b981',
    '--ps-accent-rgb': '16 185 129',
    '--ps-accent-soft': 'rgba(16, 185, 129, 0.09)',
    '--ps-accent-border': 'rgba(16, 185, 129, 0.22)',
    '--ps-accent-ink': '#047857',
  } as React.CSSProperties : {};

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  // Lists
  const [myComplaints, setMyComplaints] = useState<any[]>([]);
  const [pendingComplaints, setPendingComplaints] = useState<any[]>([]);
  const [allComplaints, setAllComplaints] = useState<any[]>([]);

  // Config/Types
  const [complaintTypes, setComplaintTypes] = useState<any[]>([]);

  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'my' | 'pending' | 'all'>('my');

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [complaintType, setComplaintType] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [remarks, setRemarks] = useState('');

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Dynamic Type Creator State
  const [showTypeCreator, setShowTypeCreator] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail View State
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
  const [showActionModal, setShowActionModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [actionComment, setActionComment] = useState('');

  // Load user
  useEffect(() => {
    const u = auth.getUser();
    if (u) setCurrentUser(u);
  }, []);

  // Fetch complaints data
  const loadData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const isEmp = currentUser.role === 'employee';
      
      const promises: Promise<any>[] = [
        api.getMyComplaints(),
        isEmp ? Promise.resolve({ success: true, data: [] }) : api.getPendingComplaintApprovals()
      ];

      const hasElevatedAccess = ['hr', 'sub_admin', 'super_admin', 'hod'].includes(currentUser.role);
      if (hasElevatedAccess) {
        promises.push(api.getComplaints());
      }

      const results = await Promise.all(promises);

      if (results[0].success) setMyComplaints(results[0].data || []);
      if (results[1].success) setPendingComplaints(results[1].data || []);
      if (results[2] && results[2].success) setAllComplaints(results[2].data || []);

    } catch (error) {
      console.error('Failed to load complaints data:', error);
      toast.error('Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch dynamic types
  const loadTypes = async () => {
    try {
      const res = await api.getLeaveTypes('complaint');
      if (res.success) {
        setComplaintTypes(res.data || []);
      }
    } catch (err) {
      console.error('Failed to load complaint types:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
      loadTypes();
    }
  }, [currentUser]);

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    try {
      const res = await api.uploadEvidence(file);
      if (res.success && res.url) {
        setImageUrl(res.url);
        toast.success('Image uploaded successfully');
      } else {
        toast.error(res.message || 'Failed to upload image.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Upload failed.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Camera handlers & effects
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (showCamera) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      })
      .then((stream) => {
        activeStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Camera access error:', err);
        toast.error('Failed to access camera.');
        setShowCamera(false);
      });
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [showCamera]);

  useEffect(() => {
    if (!showForm) {
      setShowCamera(false);
    }
  }, [showForm]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Create temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    
    // Convert canvas to blob/file and upload
    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('Failed to capture photo.');
        return;
      }
      
      const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setUploadLoading(true);
      try {
        const res = await api.uploadEvidence(file);
        if (res.success && res.url) {
          setImageUrl(res.url);
          toast.success('Photo captured and uploaded successfully');
        } else {
          toast.error(res.message || 'Failed to upload photo.');
        }
      } catch (err) {
        console.error('Capture upload error:', err);
        toast.error('Failed to upload captured photo.');
      } finally {
        setUploadLoading(false);
      }
    }, 'image/jpeg', 0.85);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  // Submit dynamic new type
  const handleCreateType = async () => {
    const trimmedName = newTypeName.trim();
    if (!trimmedName) {
      toast.warning('Category Name is required.');
      return;
    }
    const generatedCode = trimmedName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!generatedCode) {
      toast.warning('Could not generate a valid code from Category Name.');
      return;
    }

    try {
      const payload = {
        code: generatedCode,
        name: trimmedName,
        color: '#047857', // Default brand color
        isActive: true,
      };
      const res = await api.addLeaveType('complaint', payload);
      if (res.success) {
        toast.success('Complaint Type added successfully!');
        await loadTypes();
        setComplaintType(payload.code);
        setNewTypeName('');
        setShowTypeCreator(false);
      } else {
        toast.error(res.message || 'Failed to add type.');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred.');
    }
  };

  // Submit complaint form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      toast.warning('Please select an employee.');
      return;
    }
    if (!complaintType) {
      toast.warning('Please select a complaint type.');
      return;
    }
    if (!remarks.trim()) {
      toast.warning('Please enter remarks/details.');
      return;
    }

    setSubmitLoading(true);
    try {
      const payload = {
        employeeId: selectedEmployee._id,
        empNo: selectedEmployee.emp_no,
        complaintType,
        imageUrl,
        remarks: remarks.trim(),
      };
      const res = await api.applyComplaint(payload);
      if (res.success) {
        toast.success('Consent submitted successfully!');
        setShowForm(false);
        // Clear fields
        setSelectedEmployee(null);
        setComplaintType('');
        setImageUrl('');
        setRemarks('');
        // Reload list
        loadData();
      } else {
        toast.error(res.error || 'Failed to submit consent.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle workflow action
  const handleActionSubmit = async () => {
    if (!showActionModal) return;
    setLoading(true);
    try {
      const res = await api.processComplaintAction(
        showActionModal.id,
        showActionModal.action,
        actionComment.trim()
      );
      if (res.success) {
        toast.success(`Consent successfully ${showActionModal.action}d!`);
        setShowActionModal(null);
        setActionComment('');
        setSelectedComplaint(null);
        loadData();
      } else {
        toast.error(res.error || 'Action failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setLoading(false);
    }
  };

  // Cancel pending complaint
  const handleCancelComplaint = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this consent?')) return;
    setLoading(true);
    try {
      const res = await api.cancelComplaint(id);
      if (res.success) {
        toast.success('Consent cancelled successfully.');
        setSelectedComplaint(null);
        loadData();
      } else {
        toast.error(res.error || 'Cancellation failed.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Cancellation failed.');
    } finally {
      setLoading(false);
    }
  };

  // Filter complaints
  const filterList = (list: any[]) => {
    return list.filter((comp) => {
      const targetStr = `${comp.employeeName} ${comp.emp_no}`.toLowerCase();
      const matchSearch = targetStr.includes(searchQuery.toLowerCase()) || 
        comp.complaintType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        comp.remarks.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchStatus = !statusFilter || comp.status === statusFilter;
      return matchSearch && matchStatus;
    });
  };

  const activeList = useMemo(() => {
    if (activeTab === 'my') return filterList(myComplaints);
    if (activeTab === 'pending') return filterList(pendingComplaints);
    return filterList(allComplaints);
  }, [activeTab, myComplaints, pendingComplaints, allComplaints, searchQuery, statusFilter]);

  const showElevatedTabs = currentUser && ['hr', 'sub_admin', 'super_admin', 'hod', 'manager'].includes(currentUser.role);

  // Status styling mapper
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    let bg = 'bg-slate-100 text-slate-700 border-slate-200';
    let label = status;

    if (s === 'pending') {
      bg = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900';
      label = 'Pending Review';
    } else if (s === 'approved') {
      bg = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900';
      label = 'Approved';
    } else if (s === 'rejected') {
      bg = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900';
      label = 'Rejected';
    } else if (s === 'cancelled') {
      bg = 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800';
      label = 'Cancelled';
    } else if (s.endsWith('_approved')) {
      bg = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900';
      label = `${status.split('_')[0].toUpperCase()} Approved`;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${bg}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-12 pt-2" style={themeStyles}>
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />

      {/* Sticky Premium Header */}
      <div className="sticky px-0 md:px-4 top-4 z-40 mb-6 max-w-[1920px] mx-auto">
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-none md:rounded-3xl border-x-0 md:border border-slate-200/50 dark:border-slate-800/80 shadow-md px-3 py-2.5 md:px-6 md:py-4 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto">
            <div className="h-8 w-8 md:h-12 md:w-12 rounded-lg md:rounded-2xl flex items-center justify-center shadow-xs bg-[var(--ps-accent-soft)] text-[var(--ps-accent-ink)] shrink-0">
              <AlertTriangle className="w-4 h-4 md:w-6 md:h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm md:text-xl font-semibold text-slate-900 dark:text-white uppercase tracking-tight leading-tight">
                Consents
              </h1>
              <p className="hidden xs:block text-[9px] md:text-xs font-normal text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                <span className="hidden md:inline">Grievance & Issue Tracking Flow</span>
                <span className="inline md:hidden">Tracking</span>
              </p>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 md:px-6 md:py-3 rounded-lg md:rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-[9px] md:text-xs font-medium uppercase tracking-widest flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden xs:inline">File Consent</span>
              <span className="inline xs:hidden">File</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-0 md:px-4 grid grid-cols-1 gap-4 md:gap-6">
        
        {/* Navigation Tabs and Search filters */}
        <div className="bg-white dark:bg-slate-900 rounded-none md:rounded-3xl border-x-0 md:border border-slate-200/60 dark:border-slate-800 p-3 md:p-5 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            
            {/* Tabs */}
            <div className="w-full lg:w-auto">
              <div className={`bg-slate-100 dark:bg-slate-950 p-1 rounded-xl md:rounded-2xl w-full ${showElevatedTabs ? 'grid grid-cols-3 gap-1' : 'inline-flex'}`}>
                <button
                  onClick={() => setActiveTab('my')}
                  className={`py-2 px-1 md:px-5 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-medium uppercase tracking-wider transition-all text-center ${
                    activeTab === 'my'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <span className="hidden sm:inline">My Consents</span>
                  <span className="inline sm:hidden">Mine</span>
                </button>
                {showElevatedTabs && (
                  <>
                    <button
                      onClick={() => setActiveTab('pending')}
                      className={`py-2 px-1 md:px-5 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-medium uppercase tracking-wider transition-all relative text-center ${
                        activeTab === 'pending'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <span className="hidden sm:inline">Pending Approvals</span>
                      <span className="inline sm:hidden">Pending</span>
                      {pendingComplaints.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
                          {pendingComplaints.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`py-2 px-1 md:px-5 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-medium uppercase tracking-wider transition-all text-center ${
                        activeTab === 'all'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <span className="hidden sm:inline">All Consents</span>
                      <span className="inline sm:hidden">All</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filter Fields */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 min-w-[200px] lg:flex-none">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search consents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 text-slate-900 dark:text-white transition-all"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none text-slate-900 dark:text-white cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* List display */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--ps-accent)]" />
              <span className="text-sm font-medium">Fetching consents records...</span>
            </div>
          ) : activeList.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-slate-200 dark:border-slate-850 rounded-3xl">
              <MessageSquare className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">No Consents Found</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">There are no consents matching the current query criteria.</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-[9px] font-semibold text-slate-450 dark:text-slate-500 uppercase tracking-widest">
                      <th className="px-5 py-4">Employee</th>
                      <th className="px-5 py-4">Category / Type</th>
                      <th className="px-5 py-4">Filing Date</th>
                      <th className="px-5 py-4">Remarks</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {activeList.map((comp) => (
                      <tr
                        key={comp._id}
                        onClick={() => setSelectedComplaint(comp)}
                        className="group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-[var(--ps-accent-soft)] text-[var(--ps-accent-ink)] flex items-center justify-center font-semibold text-sm shrink-0">
                              {comp.employeeName?.[0]}
                            </div>
                            <div>
                              <span className="block text-sm font-medium text-slate-900 dark:text-white group-hover:text-[var(--ps-accent-ink)] transition-colors">
                                {comp.employeeName}
                              </span>
                              <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">
                                EMP: {comp.emp_no}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {comp.complaintType}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                            {new Date(comp.appliedAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-5 py-4 max-w-[240px]">
                          <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                            {comp.remarks}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {getStatusBadge(comp.status)}
                        </td>
                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => setSelectedComplaint(comp)}
                              className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Grid View */}
              <div className="block md:hidden -mx-3 divide-y divide-slate-100 dark:divide-slate-800/60 border-t border-slate-100 dark:border-slate-800/60">
                {activeList.map((comp) => (
                  <div
                    key={comp._id}
                    onClick={() => setSelectedComplaint(comp)}
                    className="bg-white dark:bg-slate-950 p-3.5 flex flex-col gap-2.5 active:bg-slate-50 dark:active:bg-slate-900 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-[var(--ps-accent-soft)] text-[var(--ps-accent-ink)] flex items-center justify-center font-semibold text-xs shrink-0">
                          {comp.employeeName?.[0]}
                        </div>
                        <div>
                          <span className="block text-[11px] font-medium text-slate-850 dark:text-white leading-tight">
                            {comp.employeeName}
                          </span>
                          <span className="block text-[8px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                            EMP: {comp.emp_no}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 scale-75 origin-right">
                        {getStatusBadge(comp.status)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] gap-2 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-medium">
                        {comp.complaintType}
                      </span>
                      <span className="text-slate-400 font-medium">
                        {new Date(comp.appliedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {comp.remarks && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 leading-relaxed bg-slate-50/50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100/50 dark:border-slate-800/40">
                        {comp.remarks}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-end text-[9px] font-medium uppercase tracking-wider text-[var(--ps-accent-ink)] gap-1">
                      View Details <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slide-over Detailed Panel (Complaint Detail Drawer) */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedComplaint(null)} />
          
          <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-slide-in">
            
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Consent Details</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Review status and evidence logs</p>
              </div>
              <button
                onClick={() => setSelectedComplaint(null)}
                className="h-10 w-10 rounded-full border border-slate-200/60 dark:border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-950 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              
              {/* Employee Information Card */}
              <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-[var(--ps-accent-soft)] text-[var(--ps-accent-ink)] flex items-center justify-center font-bold text-lg shrink-0">
                  {selectedComplaint.employeeName?.[0]}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedComplaint.employeeName}</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span>Emp Code: <strong className="text-slate-900 dark:text-white">{selectedComplaint.emp_no}</strong></span>
                    <span>Designation: <strong className="text-slate-900 dark:text-white">{selectedComplaint.designation || 'N/A'}</strong></span>
                    <span>Department: <strong className="text-slate-900 dark:text-white">{selectedComplaint.department_name || 'N/A'}</strong></span>
                    <span>Division: <strong className="text-slate-900 dark:text-white">{selectedComplaint.division_name || 'N/A'}</strong></span>
                  </div>
                </div>
              </div>

              {/* Remarks/Issue Description */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Consent Details</h4>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850">
                  <div className="flex justify-between items-center mb-3">
                    <span className="inline-flex px-3 py-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-lg uppercase tracking-wide">
                      {selectedComplaint.complaintType}
                    </span>
                    <span className="text-[11px] text-slate-400 font-bold uppercase">
                      Filed: {new Date(selectedComplaint.appliedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-350 leading-relaxed font-medium">
                    {selectedComplaint.remarks}
                  </p>
                </div>
              </div>

              {/* Uploaded Evidence Image */}
              {selectedComplaint.imageUrl && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Evidence File / Image</h4>
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-2 group">
                    <img
                      src={selectedComplaint.imageUrl}
                      alt="Complaint Evidence"
                      className="max-h-64 rounded-xl object-contain shadow-sm"
                    />
                    <a
                      href={selectedComplaint.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute right-4 top-4 p-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Full Size
                    </a>
                  </div>
                </div>
              )}

              {/* Dynamic Workflow Timeline History */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Approval Workflow Tracker</h4>
                <div className="relative border-l-2 border-slate-100 dark:border-slate-850 pl-6 ml-4 space-y-6 py-2">
                  
                  {/* Approval steps from chain */}
                  {selectedComplaint.workflow?.approvalChain?.map((step: any, idx: number) => {
                    const isStepPending = step.status === 'pending';
                    const isStepApproved = step.status === 'approved';
                    const isStepRejected = step.status === 'rejected';

                    let icon = <Clock className="w-4 h-4 text-amber-500" />;
                    let color = 'text-slate-500';
                    let stepStatusText = 'Awaiting Review';

                    if (isStepApproved) {
                      icon = <CheckCircle className="w-4 h-4 text-emerald-500" />;
                      color = 'text-emerald-600 dark:text-emerald-400';
                      stepStatusText = 'Approved';
                    } else if (isStepRejected) {
                      icon = <XCircle className="w-4 h-4 text-rose-500" />;
                      color = 'text-rose-600 dark:text-rose-400';
                      stepStatusText = 'Rejected';
                    }

                    return (
                      <div key={idx} className="relative">
                        <span className="absolute -left-[33px] top-1 h-5 w-5 rounded-full border-2 border-white bg-slate-100 dark:border-slate-900 dark:bg-slate-800 flex items-center justify-center shadow-sm">
                          {icon}
                        </span>
                        <div className="space-y-0.5">
                          <h5 className="text-xs font-semibold text-slate-900 dark:text-white uppercase tracking-wide">
                            {step.label || `${step.role.toUpperCase()} Action`}
                          </h5>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className={`font-semibold uppercase ${color}`}>
                              {stepStatusText}
                            </span>
                            {(step.actionByName || step.updatedAt) && (
                              <span className="text-slate-400 dark:text-slate-500 font-medium">
                                by {step.actionByName || 'Approver'} {step.updatedAt ? `on ${new Date(step.updatedAt).toLocaleString()}` : ''}
                              </span>
                            )}
                          </div>
                          {step.comments && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-1 leading-relaxed pl-2 border-l border-slate-200 dark:border-slate-800">
                              &quot;{step.comments}&quot;
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* History Logs */}
                  {selectedComplaint.workflow?.history?.filter((log: any) => !['approved', 'rejected'].includes(log.action))?.map((log: any, idx: number) => (
                    <div key={`hist-${idx}`} className="relative pl-2 py-1 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-850">
                      <span className="absolute -left-[31px] top-4 h-4 w-4 rounded-full border-2 border-white bg-slate-200 dark:border-slate-900 dark:bg-slate-800 flex items-center justify-center shadow-xs">
                        <User className="w-2.5 h-2.5 text-slate-500" />
                      </span>
                      <div className="p-2 space-y-1 text-xs">
                        <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200">
                          <span>{log.actionByName} ({log.actionByRole?.toUpperCase()})</span>
                          <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-450 font-medium">
                          Action: <strong className="text-slate-700 dark:text-slate-300 uppercase">{log.action}</strong>
                        </div>
                        {log.comments && (
                          <div className="text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded-lg mt-1 border border-slate-100 dark:border-slate-850">
                            &quot;{log.comments}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                </div>
              </div>

            </div>

            {/* Action Area */}
            {currentUser && (
              <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                {/* Cancel option */}
                {selectedComplaint.status === 'pending' && selectedComplaint.appliedBy === currentUser.id && (
                  <button
                    onClick={() => handleCancelComplaint(selectedComplaint._id)}
                    className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Cancel Consent
                  </button>
                )}

                {/* Approver Action Panel */}
                {activeTab === 'pending' && selectedComplaint.status !== 'approved' && selectedComplaint.status !== 'rejected' && selectedComplaint.status !== 'cancelled' && (
                  <>
                    <button
                      onClick={() => setShowActionModal({ id: selectedComplaint._id, action: 'reject' })}
                      className="flex-1 py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => setShowActionModal({ id: selectedComplaint._id, action: 'approve' })}
                      className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-all"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submit New Complaint Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-[100] overflow-hidden flex items-end sm:items-center justify-center p-2 pb-20 sm:p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-fade-in flex flex-col max-h-[calc(100vh-90px)] sm:max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-tight">File A Consent</h3>
                <p className="text-[8px] sm:text-[9px] text-slate-400 font-medium uppercase tracking-wider">Fill in the employee issue parameters</p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="h-7 w-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Body (Scrollable Form) */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-5 sm:py-4 space-y-3 sm:space-y-4">
              
              {/* Employee Autocomplete search */}
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Search Employee
                </label>
                <EmployeeSelect
                  value={selectedEmployee?._id || ''}
                  onChange={(emp) => setSelectedEmployee(emp)}
                  required
                />
              </div>

              {/* Employee Details Card (rendered when employee is entered) */}
              {selectedEmployee && (
                <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-1.5 sm:space-y-2">
                  <h4 className="text-[7.5px] sm:text-[8px] font-semibold uppercase tracking-wider text-slate-400">Employee Profile Context</h4>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md sm:rounded-lg bg-[var(--ps-accent-soft)] text-[var(--ps-accent-ink)] flex items-center justify-center font-semibold text-xs sm:text-sm shrink-0">
                      {selectedEmployee.employee_name?.[0]}
                    </div>
                    <div>
                      <span className="block text-[11px] sm:text-xs font-semibold text-slate-900 dark:text-white">
                        {selectedEmployee.employee_name}
                      </span>
                      <span className="block text-[8px] sm:text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                        No: {selectedEmployee.emp_no} | Dept: {selectedEmployee.department_id?.name || 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-850 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span>Designation: <strong className="text-slate-950 dark:text-white">{selectedEmployee.designation_id?.name || selectedEmployee.designation || 'N/A'}</strong></span>
                    <span>Email: <strong className="text-slate-950 dark:text-white">{selectedEmployee.email || 'N/A'}</strong></span>
                  </div>
                </div>
              )}

              {/* Complaint Type Select */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Consent Category / Type
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTypeCreator((v) => !v)}
                    className="text-[9px] sm:text-[9.5px] font-semibold text-[var(--ps-accent-ink)] hover:opacity-90 uppercase tracking-widest flex items-center gap-1"
                  >
                    {showTypeCreator ? 'Select Type' : '+ Add New Type'}
                  </button>
                </div>

                {!showTypeCreator ? (
                  <select
                    value={complaintType}
                    onChange={(e) => setComplaintType(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] sm:text-xs focus:outline-none text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="">Choose consent type...</option>
                    {complaintTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl border border-[var(--ps-accent-border)] bg-[var(--ps-accent-soft)] space-y-2">
                    <h4 className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-wider text-[var(--ps-accent-ink)]">Create Dynamic Category</h4>
                    <div className="space-y-0.5">
                      <label className="text-[8px] font-semibold uppercase text-slate-400">Category Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Salary delay"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-[11px] text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowTypeCreator(false)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[9px] font-medium uppercase tracking-wider"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateType}
                        className="px-2.5 py-1 bg-[var(--ps-accent)] hover:opacity-90 text-white rounded-md text-[9px] font-medium uppercase tracking-wider"
                      >
                        Register Category
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Image Adding Upload */}
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Image Attachment (Optional)
                </label>
                
                {showCamera ? (
                  <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 flex flex-col items-center justify-center p-2">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full max-h-48 rounded-lg object-contain bg-black"
                    />
                    <div className="flex justify-center gap-2.5 mt-2.5 w-full pb-1.5">
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-white text-[10px] font-semibold uppercase tracking-wider rounded-lg transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={capturePhoto}
                        className="px-3 py-1.5 bg-[var(--ps-accent)] hover:opacity-90 text-white text-[10px] font-semibold uppercase tracking-wider rounded-lg shadow-sm transition-all"
                      >
                        Capture
                      </button>
                    </div>
                  </div>
                ) : !imageUrl ? (
                  <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 text-center bg-slate-50/20 dark:bg-slate-900/10 relative">
                    {uploadLoading ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 py-1.5">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--ps-accent)]" />
                        <span className="text-[10px] font-semibold text-slate-500">Uploading media...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5 sm:gap-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <ImageIcon className="w-5 h-5 text-slate-400 mb-0.5" />
                          <span className="text-[10px] sm:text-[11px] font-semibold text-slate-650 dark:text-slate-350">
                            Select an option to add evidence
                          </span>
                          <span className="text-[8px] sm:text-[9px] text-slate-400">
                            Only JPG, PNG formats up to 20MB
                          </span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 sm:gap-2 w-full">
                          <label className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[8.5px] sm:text-[9px] font-medium uppercase tracking-wider rounded-md sm:rounded-lg cursor-pointer transition-all">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageUpload}
                              disabled={uploadLoading}
                              className="hidden"
                            />
                            Upload File
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowCamera(true)}
                            className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[8.5px] sm:text-[9px] font-medium uppercase tracking-wider rounded-md sm:rounded-lg transition-all"
                          >
                            Take Photo
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-850 p-1.5 flex items-center justify-center bg-slate-50 dark:bg-slate-950 group">
                    <img
                      src={imageUrl}
                      alt="Preview Attachment"
                      className="max-h-36 rounded-lg object-contain shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute right-3 top-3 p-1.5 rounded-lg bg-rose-500 hover:bg-rose-650 text-white shadow-sm transition-all flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* Remarks Textarea */}
              <div className="space-y-1">
                <label className="text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Consent Remarks / Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Detail the issue or description here..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] sm:text-xs focus:outline-none text-slate-900 dark:text-white transition-all focus:ring-2 focus:ring-[var(--ps-accent)]/20"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2.5 flex gap-2 sm:gap-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] sm:text-xs font-semibold uppercase tracking-widest rounded-lg sm:rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  disabled={submitLoading || uploadLoading}
                  className="flex-1 py-2 sm:py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-white text-[10px] sm:text-xs font-semibold uppercase tracking-widest rounded-lg sm:rounded-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3 sm:w-3.5 h-3.5" />
                      File Consent
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Approve/Reject Comments Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-[100] overflow-hidden flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200/50 dark:border-slate-800/80 animate-scale-up space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Add Approval Comments
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Action: <strong className={showActionModal.action === 'approve' ? 'text-emerald-500' : 'text-rose-500'}>{showActionModal.action.toUpperCase()}</strong>
              </p>
            </div>

            <textarea
              rows={3}
              placeholder="Enter approval/rejection justification or remarks..."
              value={actionComment}
              onChange={(e) => setActionComment(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none text-slate-900 dark:text-white transition-all focus:ring-2 focus:ring-[var(--ps-accent)]/20"
            />

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setActionComment('');
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleActionSubmit}
                className={`flex-1 py-3 text-white text-xs font-black uppercase tracking-widest rounded-xl ${
                  showActionModal.action === 'approve'
                    ? 'bg-emerald-500 hover:bg-emerald-600'
                    : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                Confirm {showActionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
