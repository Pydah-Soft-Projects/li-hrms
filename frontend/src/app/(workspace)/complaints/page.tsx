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

const COMPLAINTS_PAGE_STORAGE_KEY = 'complaints_page_state_v1';

export default function ComplaintsPage() {
  const pathname = usePathname();
  const isSuperAdminRoute = pathname?.includes('/superadmin');

  const [activeTab, setActiveTab] = useState<'my' | 'pending' | 'all' | 'history'>(() => {
    if (typeof window === 'undefined') return 'my';
    try {
      const saved = window.localStorage.getItem(COMPLAINTS_PAGE_STORAGE_KEY);
      if (!saved) return 'my';
      const parsed = JSON.parse(saved);
      const validTab = ['my', 'pending', 'all', 'history'].includes(parsed?.activeTab);
      return validTab ? parsed.activeTab : 'my';
    } catch {
      return 'my';
    }
  });

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Reset category filter when changing tabs
  useEffect(() => {
    setSelectedCategory(null);
  }, [activeTab]);

  // Complaint History States
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedHistoryEmployee, setSelectedHistoryEmployee] = useState<any | null>(null);
  const [historyEmployees, setHistoryEmployees] = useState<any[]>([]);
  const [historyEmpSearch, setHistoryEmpSearch] = useState('');
  const [historyDivFilter, setHistoryDivFilter] = useState('');
  const [historyDeptFilter, setHistoryDeptFilter] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Detail View State
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
  const [showActionModal, setShowActionModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [actionComment, setActionComment] = useState('');



  // Load divisions on mount
  useEffect(() => {
    const loadDivisions = async () => {
      try {
        const res = await api.getDivisions(true);
        if (res.success) setDivisions(res.data || []);
      } catch (err) {
        console.error('Failed to load divisions:', err);
      }
    };
    loadDivisions();
  }, []);

  // Load departments filtered by selected division (interconnected)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getDepartments(true, historyDivFilter || undefined);
        if (res.success) {
          const d = res.data || [];
          setDepartments(d);
          if (historyDeptFilter && !d.some((x: any) => x._id === historyDeptFilter)) {
            setHistoryDeptFilter('');
          }
        }
      } catch {}
    };
    load();
  }, [historyDivFilter]);

  // Fetch employees whenever history tab is active or filters/search change
  useEffect(() => {
    if (activeTab !== 'history') return;
    const fetch = async () => {
      setHistoryLoading(true);
      try {
        const res = await api.getEmployeesList({
          search: historyEmpSearch || undefined,
          division_id: historyDivFilter || undefined,
          department_id: historyDeptFilter || undefined,
          is_active: true,
        });
        if (res.success) setHistoryEmployees(res.data || []);
      } catch {}
      finally { setHistoryLoading(false); }
    };
    const t = setTimeout(fetch, 300);
    return () => clearTimeout(t);
  }, [activeTab, historyEmpSearch, historyDivFilter, historyDeptFilter]);

  // Restore saved view state after reload
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(COMPLAINTS_PAGE_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);

      if (parsed?.selectedHistoryEmployee) {
        setSelectedHistoryEmployee(parsed.selectedHistoryEmployee);
      }
      if (parsed?.historyEmpSearch) {
        setHistoryEmpSearch(parsed.historyEmpSearch);
      }
      if (parsed?.historyDivFilter) {
        setHistoryDivFilter(parsed.historyDivFilter);
      }
      if (parsed?.historyDeptFilter) {
        setHistoryDeptFilter(parsed.historyDeptFilter);
      }
      if (parsed?.startDate) {
        setStartDate(parsed.startDate);
      }
      if (parsed?.endDate) {
        setEndDate(parsed.endDate);
      }
    } catch {
      // Ignore invalid localStorage state
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const pageState = {
        activeTab,
        selectedHistoryEmployee,
        historyEmpSearch,
        historyDivFilter,
        historyDeptFilter,
        startDate,
        endDate,
      };
      window.localStorage.setItem(COMPLAINTS_PAGE_STORAGE_KEY, JSON.stringify(pageState));
    } catch {
      // Ignore localStorage write issues
    }
  }, [activeTab, selectedHistoryEmployee, historyEmpSearch, historyDivFilter, historyDeptFilter, startDate, endDate]);

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
        video: { facingMode: 'environment', aspectRatio: 16 / 9 },
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
    
    const W = video.videoWidth || 640;
    const H = video.videoHeight || 480;
    
    // Target aspect ratio is 16:9
    const targetAspect = 16 / 9;
    const currentAspect = W / H;
    
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = W;
    let sourceHeight = H;
    
    if (currentAspect > targetAspect) {
      // Current frame is wider than 16:9 -> crop width
      sourceWidth = H * targetAspect;
      sourceX = (W - sourceWidth) / 2;
    } else {
      // Current frame is taller than 16:9 -> crop height
      sourceHeight = W / targetAspect;
      sourceY = (H - sourceHeight) / 2;
    }
    
    // Create temporary canvas
    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw the cropped center portion of the video frame to the canvas
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight, // Source bounds
      0,
      0,
      sourceWidth,
      sourceHeight // Destination bounds
    );
    
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
        (comp.remarks && comp.remarks.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchStatus = !statusFilter || comp.status === statusFilter;
      const matchCategory = !selectedCategory || comp.complaintType === selectedCategory;
      return matchSearch && matchStatus && matchCategory;
    });
  };

  const activeList = useMemo(() => {
    if (activeTab === 'my') return filterList(myComplaints);
    if (activeTab === 'pending') return filterList(pendingComplaints);
    return filterList(allComplaints);
  }, [activeTab, myComplaints, pendingComplaints, allComplaints, searchQuery, statusFilter, selectedCategory]);

  const showElevatedTabs = currentUser && ['hr', 'sub_admin', 'super_admin', 'hod', 'manager'].includes(currentUser.role);

  const employeeComplaints = useMemo(() => {
    if (!selectedHistoryEmployee) return [];
    return allComplaints.filter(comp => {
      const empIdStr = comp.employeeId?._id?.toString() || comp.employeeId?.toString() || '';
      const targetEmpId = selectedHistoryEmployee._id?.toString() || '';
      if (empIdStr !== targetEmpId) return false;
      if (startDate || endDate) {
        const compDateStr = new Date(comp.appliedAt || comp.createdAt).toISOString().split('T')[0];
        if (startDate && compDateStr < startDate) return false;
        if (endDate && compDateStr > endDate) return false;
      }
      return true;
    });
  }, [allComplaints, selectedHistoryEmployee, startDate, endDate]);

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

  // Category aggregates computation
  const categoryAggregates = useMemo(() => {
    let list = [];
    if (activeTab === 'history') {
      if (selectedHistoryEmployee) {
        list = employeeComplaints;
      } else {
        return { counts: {}, total: 0 };
      }
    } else {
      if (activeTab === 'my') list = myComplaints;
      else if (activeTab === 'pending') list = pendingComplaints;
      else list = allComplaints;
    }

    // Filter by search & status so the counts are accurate for the current filtered set.
    const filteredList = list.filter(comp => {
      const targetStr = `${comp.employeeName || ''} ${comp.emp_no || ''}`.toLowerCase();
      const matchSearch = activeTab === 'history' ? true : targetStr.includes(searchQuery.toLowerCase()) || 
        comp.complaintType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (comp.remarks && comp.remarks.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchStatus = activeTab === 'history' ? true : !statusFilter || comp.status === statusFilter;
      return matchSearch && matchStatus;
    });

    const counts: { [key: string]: number } = {};
    let total = 0;
    filteredList.forEach(comp => {
      const cat = comp.complaintType || 'Unassigned';
      counts[cat] = (counts[cat] || 0) + 1;
      total++;
    });

    return { counts, total };
  }, [activeTab, myComplaints, pendingComplaints, allComplaints, searchQuery, statusFilter, employeeComplaints, selectedHistoryEmployee]);

  const renderCategoryAggregates = () => {
    if (activeTab === 'history' && !selectedHistoryEmployee) return null;
    if (categoryAggregates.total === 0) return null;

    return (
      <div className="w-full px-2 md:px-3 mb-2.5">
        <div className="flex flex-col rounded-2xl md:rounded-3xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
              {/* All Categories Card */}
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold shrink-0 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                  !selectedCategory
                    ? 'border-[var(--ps-accent)] bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                    : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950 text-slate-600 dark:text-slate-450 hover:border-slate-200 dark:hover:border-slate-700'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--ps-accent)]" />
                <span>All Categories</span>
                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[8.5px] font-black ${
                  !selectedCategory
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                    : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {categoryAggregates.total}
                </span>
              </button>

              {/* Individual Category Cards */}
              {Object.entries(categoryAggregates.counts).map(([cat, count]) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(isSelected ? null : cat)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold shrink-0 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${
                      isSelected
                        ? 'border-[var(--ps-accent)] bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 font-bold shadow-xs'
                        : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950 text-slate-600 dark:text-slate-450 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-[var(--ps-accent)]' : 'bg-slate-400 dark:bg-slate-500'}`} />
                    <span>{cat}</span>
                    <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[8.5px] font-black ${
                      isSelected
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                        : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                // className="shrink-0 text-[10px] font-bold text-[var(--ps-accent-ink)] hover:underline dark:text-emerald-450 cursor-pointer whitespace-nowrap bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-850 hover:border-slate-350 transition-all active:scale-[0.98] select-none"
              >
                {/* Clear Category Filter */}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render History View ────────────────────────────────────────────────────
  const renderHistoryView = () => {
    // Employee detail page
    if (selectedHistoryEmployee) {
      const initials = (selectedHistoryEmployee.employee_name || 'U')
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const sortedComplaints = [...employeeComplaints]
        .filter(comp => !selectedCategory || comp.complaintType === selectedCategory)
        .sort((a, b) => {
          const dateA = new Date(a.appliedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.appliedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });


      return (
        <div className="w-full space-y-3 animate-fadeIn">
          <div className="w-full rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  onClick={() => { setSelectedHistoryEmployee(null); setStartDate(''); setEndDate(''); }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 transition-all hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  aria-label="Back to employee list"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>

                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ps-accent-soft)] text-sm font-black uppercase text-[var(--ps-accent-ink)] shadow-sm">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900 dark:text-white">
                      {selectedHistoryEmployee.employee_name}
                    </h2>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {selectedHistoryEmployee.designation_id?.name || selectedHistoryEmployee.designation || 'Staff'}
                      {' · '}No. {selectedHistoryEmployee.emp_no}
                      {selectedHistoryEmployee.department_id?.name && ` · ${selectedHistoryEmployee.department_id.name}`}
                      {selectedHistoryEmployee.division_id?.name && ` · ${selectedHistoryEmployee.division_id.name}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3 lg:justify-end">
                <div className="flex min-w-[180px] flex-col gap-1.5 sm:min-w-[300px] sm:flex-row sm:items-end">
                  <div className="flex min-w-[140px] flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">From Date</label>
                    <input
                      type="date"
                      lang="en-GB"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex min-w-[140px] flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">To Date</label>
                    <input
                      type="date"
                      lang="en-GB"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition-all hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {employeeComplaints.length} Total
                  </span>
                  {employeeComplaints.filter(c => c.status === 'pending').length > 0 && (
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {employeeComplaints.filter(c => c.status === 'pending').length} Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {renderCategoryAggregates()}

          {sortedComplaints.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
              <MessageSquare className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">No complaints found</p>
              <p className="mt-1 text-[10px] text-slate-400">Try adjusting the date range filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedComplaints.map((comp, idx) => {
                const dateStr = comp.appliedAt || comp.createdAt
                  ? new Date(comp.appliedAt || comp.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';

                return (
                  <div key={comp._id} className="relative animate-fadeIn">
                    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xs hover:shadow-sm hover:border-slate-200 dark:border-slate-800/65 dark:bg-slate-900 transition-all duration-300 flex flex-col h-full">
                      {/* 16:9 Aspect Ratio Widescreen Image on Top */}
                      {comp.imageUrl ? (
                        <div className="relative w-full aspect-video shrink-0 overflow-hidden bg-slate-50 dark:bg-slate-955">
                          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 rounded-lg bg-emerald-700 px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-white backdrop-blur-xs shadow-sm">
                            <ImageIcon className="h-2.5 w-2.5" />
                            Evidence
                          </div>
                          <a
                            href={comp.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="relative block w-full h-full overflow-hidden"
                          >
                            <img src={comp.imageUrl} alt="Evidence attachment" className="h-full w-full object-cover rounded-t-3xl transition-transform duration-300 hover:scale-[1.01]" />
                            <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[7px] font-bold uppercase tracking-wider text-white backdrop-blur-xs transition-colors hover:bg-black/80">
                              <ExternalLink className="h-2 w-2" /> View
                            </span>
                          </a>
                        </div>
                      ) : (
                        <div className="flex w-full aspect-video shrink-0 flex-col items-center justify-center border-b border-dashed border-slate-200 bg-slate-50/50 p-4 text-center dark:border-slate-800 dark:bg-slate-950/30 rounded-t-3xl">
                          <ImageIcon className="mb-2 h-7 w-7 text-slate-355 dark:text-slate-655" />
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">No Image Evidence</p>
                        </div>
                      )}

                      {/* Bottom section split into two parts */}
                      <div className="p-3.5 flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                        {/* Part 1 (Left details): Header info, Status Badge, Remarks */}
                        <div className="space-y-3 min-w-0 flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2.5 border-b border-slate-100 pb-2 dark:border-slate-800/80">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-355 shrink-0">
                                  <User className="h-4.5 w-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-white leading-tight truncate">
                                    {comp.complaintType || '—'}
                                  </h3>
                                  <p className="mt-0.5 text-[8px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    Filed on {dateStr}
                                  </p>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {(() => {
                                  const s = comp.status.toLowerCase();
                                  let pillBg = 'bg-slate-50 border-slate-200 text-slate-700';
                                  let pillIcon = <Clock className="h-3 w-3" />;
                                  let pillLabel = comp.status;

                                  if (s === 'approved') {
                                    pillBg = 'bg-[#eefdf6] border-[#def7ec] text-[#03543f] dark:bg-[#03543f]/20 dark:border-[#03543f]/30 dark:text-[#31c48d]';
                                    pillIcon = <CheckCircle className="h-3 w-3 text-[#0a9f6e]" />;
                                    pillLabel = 'Approved';
                                  } else if (s === 'rejected') {
                                    pillBg = 'bg-rose-50 border-rose-100 text-rose-700 dark:bg-rose-955/20 dark:border-rose-900/30 dark:text-rose-400';
                                    pillIcon = <XCircle className="h-3 w-3 text-rose-650" />;
                                    pillLabel = 'Rejected';
                                  } else if (s === 'cancelled') {
                                    pillBg = 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400';
                                    pillIcon = <XCircle className="h-3 w-3 text-slate-400" />;
                                    pillLabel = 'Cancelled';
                                  } else if (s === 'pending') {
                                    pillBg = 'bg-amber-50 border-amber-100 text-amber-700 dark:bg-amber-955/20 dark:border-amber-900/30 dark:text-amber-400';
                                    pillIcon = <Clock className="h-3 w-3 text-amber-600" />;
                                    pillLabel = 'Pending';
                                  }

                                  return (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border ${pillBg}`}>
                                      {pillIcon}
                                      {pillLabel}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>

                            {comp.remarks && (
                              <div className="space-y-0.5">
                                <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Remarks</p>
                                <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 text-[9.5px] font-semibold leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                                  {comp.remarks}
                                </p>
                              </div>
                            )}

                            {/* History/Submission Logs */}
                            {comp.workflow?.history?.filter((log: any) => !['approved', 'rejected'].includes(log.action))?.length > 0 && (
                              <div className="space-y-1.5 pt-1.5 border-t border-dashed border-slate-200/50 dark:border-slate-800/60">
                                {comp.workflow.history
                                  .filter((log: any) => !['approved', 'rejected'].includes(log.action))
                                  .map((log: any, idx: number) => {
                                    const logDate = log.updatedAt || log.createdAt || comp.appliedAt || comp.createdAt;
                                    const formattedLogDate = logDate
                                      ? new Date(logDate).toLocaleDateString('en-GB') + ' • ' + new Date(logDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                                      : '';

                                    return (
                                      <div key={`hist-${idx}`} className="flex flex-col gap-0.5 rounded-xl bg-slate-50/50 dark:bg-slate-955/20 p-2 border border-slate-100/85 dark:border-slate-800/40">
                                        <div className="text-slate-500 dark:text-slate-400 font-medium leading-normal text-[8.5px] truncate" title={`${log.actionByName} completed action ${log.action} • ${formattedLogDate}`}>
                                          <strong className="font-bold text-slate-800 dark:text-slate-100">{log.actionByName}</strong>
                                          {' '}completed action <span className="font-extrabold uppercase text-slate-905 dark:text-white">{log.action}</span>
                                          {' '}• <span className="text-[7.5px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{formattedLogDate}</span>
                                        </div>
                                        {log.comments && (
                                          <p className="italic text-[7.5px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                                            &quot;{log.comments}&quot;
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Part 2 (Right details): Workflow Status, Cancel Consent */}
                        <div className="space-y-3 min-w-0 flex flex-col justify-between h-full">
                          <div className="space-y-2">
                            {comp.workflow?.approvalChain && comp.workflow.approvalChain.length > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Workflow Status</p>
                                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {comp.workflow.approvalChain.filter((step: any) => step.status === 'approved').length}/{comp.workflow.approvalChain.length} DONE
                                  </span>
                                </div>

                                <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-2 dark:border-slate-800 dark:bg-slate-955/10">
                                  <div className="relative space-y-2 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-emerald-600/20 dark:before:bg-emerald-950/30">
                                    {comp.workflow.approvalChain.map((step: any, idx: number) => {
                                      const isStepApproved = step.status === 'approved';
                                      const isStepRejected = step.status === 'rejected';
                                      let stepIcon = <Clock className="h-1.5 w-1.5 text-amber-500" />;
                                      let dotClass = 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-955/40';
                                      let badgeClass = 'border-amber-100 text-amber-705 dark:border-amber-900/40 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20';
                                      let stepText = 'AWAITING';

                                      if (isStepApproved) {
                                        stepIcon = <Check className="h-1.5 w-1.5 text-white" />;
                                        dotClass = 'bg-emerald-600 border-emerald-600 text-white';
                                        badgeClass = 'border-emerald-200 text-emerald-700 bg-emerald-50/50 dark:border-emerald-900/50 dark:text-emerald-400 dark:bg-emerald-950/20';
                                        stepText = 'APPROVED';
                                      } else if (isStepRejected) {
                                        stepIcon = <X className="h-1.5 w-1.5 text-white" />;
                                        dotClass = 'bg-rose-600 border-rose-600 text-white';
                                        badgeClass = 'border-rose-200 text-rose-700 bg-rose-50/50 dark:border-rose-900/50 dark:text-rose-400 dark:bg-rose-955/20';
                                        stepText = 'REJECTED';
                                      }

                                      return (
                                        <div key={idx} className="relative pl-5 py-1">
                                          <span className={`absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border shadow-sm ${dotClass}`}>
                                            {stepIcon}
                                          </span>

                                          <div className="space-y-1">
                                            <div>
                                              <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                                                {step.label || `${step.role.toUpperCase()} Review`}
                                              </p>
                                              {step.actionByName && (
                                                <p className="mt-0.5 text-[8px] text-slate-400 dark:text-slate-500">
                                                  by {step.actionByName} • {new Date(step.updatedAt || step.createdAt).toLocaleDateString('en-GB')}
                                                </p>
                                              )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span className={`inline-flex items-center rounded border px-1.5 py-0.2 text-[6.5px] font-black uppercase tracking-wider ${badgeClass}`}>
                                                {stepText}
                                              </span>
                                              {step.comments && (
                                                <span className="text-[8.5px] italic font-semibold text-slate-500 dark:text-slate-400">
                                                  &quot;{step.comments}&quot;
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {comp.status === 'pending' && comp.appliedBy === currentUser?.id && (
                            <button
                              onClick={() => handleCancelComplaint(comp._id)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-600 transition-all hover:bg-rose-100 dark:bg-rose-955/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Cancel Consent
                            </button>
                          )}
                        </div>
                      </div>


                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Employee search + filter list
    return (
      <div className="space-y-5 animate-fadeIn">
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={historyEmpSearch}
              onChange={e => setHistoryEmpSearch(e.target.value)}
              placeholder="Search employee name or number..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-xs font-medium text-slate-900 transition-all placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <select
            value={historyDivFilter}
            onChange={e => { setHistoryDivFilter(e.target.value); setHistoryDeptFilter(''); }}
            className="min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>

          <select
            value={historyDeptFilter}
            onChange={e => setHistoryDeptFilter(e.target.value)}
            className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent)]/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>

          {(historyDivFilter || historyDeptFilter || historyEmpSearch) && (
            <button
              onClick={() => { setHistoryDivFilter(''); setHistoryDeptFilter(''); setHistoryEmpSearch(''); }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition-all hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {historyLoading ? (
          <div className="rounded-3xl border border-slate-200 bg-white py-20 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
            Loading employees...
          </div>
        ) : historyEmployees.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-20 text-center dark:border-slate-800 dark:bg-slate-900">
            <User className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">No employees found</p>
            <p className="mt-1 text-[10px] text-slate-400">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {historyEmployees.map(emp => {
              const empComplaints = allComplaints.filter(c =>
                (c.employeeId?._id?.toString() || c.employeeId?.toString()) === emp._id?.toString()
              );
              const pending = empComplaints.filter(c => c.status === 'pending').length;
              const initials = (emp.employee_name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

              return (
                <button
                  key={emp._id}
                  onClick={() => { setSelectedHistoryEmployee(emp); setStartDate(''); setEndDate(''); }}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-200 hover:border-[var(--ps-accent-border)] hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ps-accent-soft)] text-xs font-black uppercase text-[var(--ps-accent-ink)] transition-transform group-hover:scale-105">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-900 transition-colors group-hover:text-[var(--ps-accent-ink)] dark:text-white dark:group-hover:text-[var(--ps-accent)]">
                        {emp.employee_name}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{emp.designation_id?.name || emp.designation || 'Staff'}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">No. {emp.emp_no}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 pb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      {empComplaints.length} complaint{empComplaints.length !== 1 ? 's' : ''}
                    </span>
                    {pending > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        {pending} pending
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (activeTab === 'history' && selectedHistoryEmployee) {
    return (
      <div className="min-h-screen w-full bg-slate-50 pb-8 pt-3 px-2 md:px-3 dark:bg-slate-950" style={themeStyles}>
        <ToastContainer position="top-right" autoClose={3000} theme="colored" />
        <div className="w-full font-sans">
          {renderHistoryView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-8 pt-1 dark:bg-slate-950" style={themeStyles}>
      <ToastContainer position="top-right" autoClose={3000} theme="colored" />

      {/* Sticky Premium Header */}
      <div className="sticky top-3 z-40 mb-3 w-full px-2 md:px-3">
        <div className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-2xl md:rounded-3xl border border-slate-200/50 dark:border-slate-800/80 shadow-md px-3 py-2 md:px-4 md:py-3 flex flex-row items-center justify-between gap-2">
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

      {renderCategoryAggregates()}

      <div className="w-full px-2 md:px-3 grid grid-cols-1 gap-3 md:gap-4 font-sans">
        
        {/* Navigation Tabs and Search filters */}
        <div className="w-full bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border border-slate-200/60 dark:border-slate-800 p-2.5 md:p-3 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            
            {/* Tabs */}
            <div className="w-full lg:w-auto">
              <div className={`bg-slate-100 dark:bg-slate-950 p-1 rounded-xl md:rounded-2xl w-full ${showElevatedTabs ? 'grid grid-cols-4 gap-1' : 'inline-flex'}`}>
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
                    <button
                      onClick={() => {
                        setActiveTab('history');
                        setSelectedHistoryEmployee(null);
                      }}
                      className={`py-2 px-1 md:px-5 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-medium uppercase tracking-wider transition-all text-center ${
                        activeTab === 'history'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-semibold'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      <span className="hidden sm:inline">Complaint History</span>
                      <span className="inline sm:hidden">History</span>
                    </button>
                  </>
                )}
              </div>
            </div>
 
            {/* Filter Fields */}
            {activeTab !== 'history' && (
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
            )}
          </div>

          {/* List display */}
          {activeTab === 'history' ? (
            renderHistoryView()
          ) : loading ? (
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
                      className="w-full aspect-video rounded-lg object-cover bg-black"
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
