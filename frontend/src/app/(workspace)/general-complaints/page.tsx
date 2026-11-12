'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileImage,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Send,
  Ticket,
  UserRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, type GeneralComplaint } from '@/lib/api';
import { auth } from '@/lib/auth';
import { isModuleEnabled } from '@/config/moduleCategories';

type ComplaintCategory = {
  id: number;
  name: string;
  description?: string | null;
  parent_id?: number | null;
};

type ComplaintPageData = {
  complaints: GeneralComplaint[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  stats: { total: number; pending: number; in_progress: number; completed: number; cancelled: number };
};

const PAGE_SIZE = 10;

const formatDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusLabel = (status: string) => status.replace(/_/g, ' ');

const statusStyle = (status: string) => {
  if (['completed', 'resolved'].includes(status)) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (['approaching', 'resolving', 'in_progress'].includes(status)) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
};

const getErrorMessage = (result: { message?: string; error?: string }) =>
  result.message || result.error || 'Please try again.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const firstText = (values: unknown[]) =>
  values.find((value): value is string | number => typeof value === 'string' || typeof value === 'number')?.toString();

export default function GeneralComplaintsPage() {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<ComplaintCategory[]>([]);
  const [subCategoriesByParent, setSubCategoriesByParent] = useState<Record<string, ComplaintCategory[]>>({});
  const [pageData, setPageData] = useState<ComplaintPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<GeneralComplaint | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSatisfied, setFeedbackSatisfied] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [photo, setPhoto] = useState<File | null>(null);
  const [form, setForm] = useState({
    category_id: '',
    sub_category_id: '',
    title: '',
    description: '',
    college_name: '',
    block_no: '',
    floor_no: '',
    room_no: '',
  });

  const loadCategories = useCallback(async () => {
    const result = await api.getGeneralComplaintCategories();
    if (!result.success || !result.data) {
      throw new Error(getErrorMessage(result));
    }
    setCategories(result.data.categories || []);
    setSubCategoriesByParent(result.data.subCategoriesByParent || {});
  }, []);

  const loadComplaints = useCallback(async () => {
    if (!featureEnabled) return;
    setLoading(true);
    try {
      const result = await api.getGeneralComplaints({
        status,
        search,
        page,
        limit: PAGE_SIZE,
      });
      if (!result.success || !result.data) {
        throw new Error(getErrorMessage(result));
      }
      setPageData(result.data);
    } catch (error) {
      console.error('Failed to load general complaints:', error);
      toast.error(error instanceof Error ? error.message : 'Could not load your complaints.');
    } finally {
      setLoading(false);
    }
  }, [featureEnabled, page, search, status]);

  useEffect(() => {
    let active = true;
    const resolveFeatureAccess = async () => {
      const currentUser = auth.getUser();
      if (!currentUser) {
        if (active) setFeatureEnabled(false);
        return;
      }

      try {
        const globalSetting = await api.getSetting('general_complaints_enabled');
        if (globalSetting.success && globalSetting.data?.value === false) {
          if (active) setFeatureEnabled(false);
          return;
        }
      } catch (error) {
        console.error('Failed to check the global General Complaints setting:', error);
      }

      if (currentUser.role === 'super_admin') {
        if (active) setFeatureEnabled(true);
        return;
      }

      let activeModules = currentUser.featureControl;
      if (!activeModules?.length) {
        activeModules = undefined;
        try {
          const result = await api.getSetting(`feature_control_${currentUser.role}`);
          activeModules = Array.isArray(result.data?.value?.activeModules)
            ? result.data.value.activeModules
            : undefined;
        } catch (error) {
          console.error('Failed to check general complaints feature access:', error);
        }
      }

      if (active) {
        setFeatureEnabled(isModuleEnabled('GENERAL_COMPLAINTS', activeModules || null));
      }
    };

    resolveFeatureAccess();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (featureEnabled !== true) return;
    loadCategories().catch((error) => {
      console.error('Failed to load maintenance complaint categories:', error);
      toast.error(error instanceof Error ? error.message : 'Could not load complaint categories.');
    });
  }, [featureEnabled, loadCategories]);

  useEffect(() => {
    if (featureEnabled === false) {
      setLoading(false);
      return;
    }
    if (featureEnabled === true) loadComplaints();
  }, [featureEnabled, loadComplaints]);

  const subCategories = useMemo(
    () => form.category_id ? subCategoriesByParent[form.category_id] || [] : [],
    [form.category_id, subCategoriesByParent]
  );

  const openComplaint = async (id: number) => {
    setDetailLoading(true);
    setSelectedComplaint(null);
    setComment('');
    setFeedbackComment('');
    setFeedbackSatisfied(null);
    try {
      const result = await api.getGeneralComplaint(id);
      if (!result.success || !result.data) throw new Error(getErrorMessage(result));
      setSelectedComplaint(result.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load complaint details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelectedComplaint = async () => {
    if (!selectedComplaint) return;
    const result = await api.getGeneralComplaint(selectedComplaint.id);
    if (!result.success || !result.data) throw new Error(getErrorMessage(result));
    setSelectedComplaint(result.data);
    await loadComplaints();
  };

  const submitComplaint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.category_id || !form.title.trim()) {
      toast.error('Choose a category and enter a complaint title.');
      return;
    }

    setSubmitting(true);
    try {
      let photoUrl = '';
      if (photo) {
        setUploading(true);
        const uploadResult = await api.uploadEvidence(photo);
        photoUrl = uploadResult.url || uploadResult.data?.url || '';
        setUploading(false);
        if (!uploadResult.success || !photoUrl) throw new Error(getErrorMessage(uploadResult));
      }

      const result = await api.createGeneralComplaint({
        ...form,
        category_id: Number(form.category_id),
        sub_category_id: form.sub_category_id ? Number(form.sub_category_id) : null,
        photo_url: photoUrl,
      });
      if (!result.success || !result.data) throw new Error(getErrorMessage(result));

      toast.success(`Complaint submitted. Ticket ${result.data.complaint_number}`);
      setFormOpen(false);
      setPhoto(null);
      setForm({
        category_id: '',
        sub_category_id: '',
        title: '',
        description: '',
        college_name: '',
        block_no: '',
        floor_no: '',
        room_no: '',
      });
      setPage(1);
      await loadComplaints();
    } catch (error) {
      setUploading(false);
      toast.error(error instanceof Error ? error.message : 'Could not submit the complaint.');
    } finally {
      setSubmitting(false);
    }
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedComplaint || !comment.trim()) return;
    setActionLoading(true);
    try {
      const result = await api.addGeneralComplaintComment(selectedComplaint.id, comment.trim());
      if (!result.success) throw new Error(getErrorMessage(result));
      setComment('');
      await refreshSelectedComplaint();
      toast.success('Comment added.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add comment.');
    } finally {
      setActionLoading(false);
    }
  };

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedComplaint) return;
    if (feedbackSatisfied === null) {
      toast.error('Please select whether you are satisfied with the resolution.');
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.submitGeneralComplaintFeedback(
        selectedComplaint.id,
        feedbackSatisfied,
        feedbackComment.trim()
      );
      if (!result.success) throw new Error(getErrorMessage(result));
      await refreshSelectedComplaint();
      toast.success(
        feedbackSatisfied
          ? 'Thanks for your feedback.'
          : 'Complaint reopened as pending for follow-up.'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit feedback.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePhotoChange = (file?: File) => {
    if (!file) {
      setPhoto(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Image must be 20 MB or smaller.');
      return;
    }
    setPhoto(file);
  };

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const stats = pageData?.stats;
  const fieldsClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-900/40';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
  const feedbackIsCurrent = (() => {
    const feedback = selectedComplaint?.feedback;
    if (!feedback) return false;
    if (feedback.submitted_at && selectedComplaint?.resolved_at) {
      return new Date(feedback.submitted_at).getTime() >= new Date(selectedComplaint.resolved_at).getTime();
    }
    return feedback.is_satisfied === true;
  })();

  if (featureEnabled === null) {
    return <div className="flex min-h-[50vh] items-center justify-center text-slate-500"><Loader2 className="mr-3 animate-spin" size={20} /> Checking access…</div>;
  }

  if (!featureEnabled) {
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <AlertCircle className="mx-auto text-slate-400" size={28} />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">General Complaints is disabled</h1>
        <p className="mt-2 text-sm text-slate-500">Ask your administrator to enable this page in Settings → Feature Control.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
              <Ticket size={15} /> Maintenance helpdesk
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">General Complaints</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Submit an issue and follow its progress from one place.</p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Plus size={18} /> New complaint
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Total tickets', value: stats?.total ?? 0, icon: Ticket, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50' },
            { label: 'Pending', value: stats?.pending ?? 0, icon: Clock3, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
            { label: 'In progress', value: stats?.in_progress ?? 0, icon: AlertCircle, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
            { label: 'Resolved', value: stats?.completed ?? 0, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className={`rounded-lg p-2 ${item.color}`}><item.icon size={16} /></span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={applySearch} className="relative w-full sm:max-w-sm">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search title or ticket number"
              className={`${fieldsClass} mt-0 pl-10`}
              aria-label="Search complaints"
            />
          </form>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={`${fieldsClass} mt-0 w-full sm:w-48`}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approaching">Approaching</option>
            <option value="in_progress">In progress</option>
            <option value="resolving">Resolving</option>
            <option value="completed">Completed</option>
            <option value="resolved">Resolved</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="animate-spin" size={20} /> Loading complaints…
            </div>
          ) : !pageData?.complaints.length ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <span className="rounded-2xl bg-slate-100 p-4 text-slate-400 dark:bg-slate-800"><Ticket size={26} /></span>
              <h2 className="mt-4 font-semibold text-slate-800 dark:text-white">No complaints found</h2>
              <p className="mt-1 text-sm text-slate-500">Submit a new complaint to get started.</p>
              <button onClick={() => setFormOpen(true)} className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700">Create complaint</button>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageData.complaints.map((complaint) => (
                  <button
                    key={complaint.id}
                    type="button"
                    onClick={() => openComplaint(complaint.id)}
                    className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{complaint.title}</span>
                        <span className="font-mono text-xs text-slate-400">{complaint.complaint_number}</span>
                      </div>
                      <p className="text-sm text-slate-500">{complaint.category_name || 'General'}{complaint.sub_category_name ? ` · ${complaint.sub_category_name}` : ''}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(complaint.created_at)} · {complaint.priority} priority</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle(complaint.status)}`}>{statusLabel(complaint.status)}</span>
                      <ChevronRight size={17} className="text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 sm:px-6">
                <span>{pageData.pagination.total} ticket{pageData.pagination.total === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-3">
                  <span>Page {pageData.pagination.page} of {Math.max(1, pageData.pagination.totalPages)}</span>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
                    aria-label="Previous page"
                  ><ChevronLeft size={16} /></button>
                  <button
                    type="button"
                    disabled={page >= pageData.pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40 dark:border-slate-700"
                    aria-label="Next page"
                  ><ChevronRight size={16} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="general-complaint-title">
          <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-3xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Maintenance helpdesk</p>
                <h2 id="general-complaint-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Submit a complaint</h2>
                <p className="mt-1 text-sm text-slate-500">Your requester details are taken from your signed-in HRMS account.</p>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close form"><X size={20} /></button>
            </div>
            <form onSubmit={submitComplaint} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Category <span className="text-rose-500">*</span>
                  <select
                    required
                    value={form.category_id}
                    onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value, sub_category_id: '' }))}
                    className={fieldsClass}
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className={labelClass}>Subcategory
                  <select
                    value={form.sub_category_id}
                    onChange={(event) => setForm((current) => ({ ...current, sub_category_id: event.target.value }))}
                    disabled={!subCategories.length}
                    className={fieldsClass}
                  >
                    <option value="">Select subcategory (optional)</option>
                    {subCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              </div>
              <label className={labelClass}>Complaint title <span className="text-rose-500">*</span>
                <input required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Briefly describe the issue" className={fieldsClass} />
              </label>
              <label className={labelClass}>Description
                <textarea maxLength={10000} rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Add details that will help the maintenance team resolve the issue" className={fieldsClass} />
              </label>
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><MapPin size={14} /> Location</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>College / site<input maxLength={255} value={form.college_name} onChange={(event) => setForm((current) => ({ ...current, college_name: event.target.value }))} className={fieldsClass} /></label>
                  <label className={labelClass}>Block<input maxLength={100} value={form.block_no} onChange={(event) => setForm((current) => ({ ...current, block_no: event.target.value }))} className={fieldsClass} /></label>
                  <label className={labelClass}>Floor<input maxLength={100} value={form.floor_no} onChange={(event) => setForm((current) => ({ ...current, floor_no: event.target.value }))} className={fieldsClass} /></label>
                  <label className={labelClass}>Room<input maxLength={100} value={form.room_no} onChange={(event) => setForm((current) => ({ ...current, room_no: event.target.value }))} className={fieldsClass} /></label>
                </div>
              </div>
              <label className={labelClass}>Photo (optional)
                <span className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-indigo-400 dark:border-slate-700 dark:text-slate-300">
                  <FileImage size={18} className="text-indigo-500" />
                  <span className="min-w-0 flex-1 truncate">{photo?.name || 'Attach an image (up to 20 MB)'}</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(event) => handlePhotoChange(event.target.files?.[0])} />
                </span>
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancel</button>
                <button disabled={submitting || uploading || !categories.length} type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={16} />}
                  {uploading ? 'Uploading image…' : submitting ? 'Submitting…' : 'Submit complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(selectedComplaint || detailLoading) && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Complaint details">
          <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
            {detailLoading || !selectedComplaint ? (
              <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={24} /></div>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-7">
                  <button type="button" onClick={() => setSelectedComplaint(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft size={17} /> Back to complaints</button>
                  <button type="button" onClick={() => setSelectedComplaint(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close details"><X size={19} /></button>
                </div>
                <div className="space-y-6 p-5 sm:p-7">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle(selectedComplaint.status)}`}>{statusLabel(selectedComplaint.status)}</span>
                      <span className="font-mono text-xs text-slate-400">{selectedComplaint.complaint_number}</span>
                    </div>
                    <h2 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{selectedComplaint.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selectedComplaint.category_name}{selectedComplaint.sub_category_name ? ` · ${selectedComplaint.sub_category_name}` : ''} · {selectedComplaint.priority} priority</p>
                    <p className="mt-2 text-xs text-slate-400">Submitted {formatDate(selectedComplaint.created_at)}</p>
                  </div>

                  {selectedComplaint.description && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">{selectedComplaint.description}</p>}
                  {(selectedComplaint.college_name || selectedComplaint.block_no || selectedComplaint.floor_no || selectedComplaint.room_no) && (
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{[selectedComplaint.college_name, selectedComplaint.block_no && `Block ${selectedComplaint.block_no}`, selectedComplaint.floor_no && `Floor ${selectedComplaint.floor_no}`, selectedComplaint.room_no && `Room ${selectedComplaint.room_no}`].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                  {selectedComplaint.photo_url && <a href={selectedComplaint.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:underline"><FileImage size={16} /> View attached photo</a>}

                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Assigned staff</h3>
                    {selectedComplaint.assignments?.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedComplaint.assignments.filter(isRecord).map((assignment, index) => {
                          const nestedPerson = assignment.assigned_user || assignment.assignedUser ||
                            assignment.user || assignment.staff || assignment.assignee || assignment.assigned_to;
                          const person = isRecord(nestedPerson) ? nestedPerson : assignment;
                          const name = firstText([
                            person.name,
                            person.user_name,
                            person.full_name,
                            person.fullName,
                            person.username,
                            person.staff_name,
                            person.employee_name,
                            assignment.assigned_to_name,
                            assignment.assignedToName,
                          ]);
                          const email = firstText([person.email, person.staff_email, assignment.assigned_to_email, assignment.assignedToEmail]);
                          const phone = firstText([person.phone, person.mobile, person.phone_number, person.mobile_no, assignment.assigned_to_phone, assignment.assignedToPhone]);
                          const role = firstText([person.role, person.designation, assignment.role]);
                          const employeeId = firstText([person.hrms_id, person.emp_no, person.employee_id, person.employeeId]);
                          const assignedAt = firstText([assignment.assigned_at, assignment.assignedAt]);

                          return (
                            <div key={String(assignment.id || assignment.user_id || index)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                              <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300"><UserRound size={18} /></span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-slate-900 dark:text-white">{name || 'Assigned staff member'}</p>
                                  {role && <p className="mt-0.5 text-xs capitalize text-slate-500">{role.replace(/_/g, ' ')}</p>}
                                  {employeeId && <p className="mt-1 text-xs text-slate-500">Staff ID: {employeeId}</p>}
                                  {email && <a href={`mailto:${email}`} className="mt-2 block break-all text-sm text-indigo-600 hover:underline">{email}</a>}
                                  {phone && <a href={`tel:${phone}`} className="mt-1 block text-sm text-indigo-600 hover:underline">{phone}</a>}
                                  {assignedAt && <p className="mt-2 text-xs text-slate-400">Assigned {formatDate(assignedAt)}</p>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No staff member has been assigned yet.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Status history</h3>
                    <div className="space-y-3">
                      {(selectedComplaint.status_history || []).slice().reverse().map((entry) => (
                        <div key={entry.id} className="flex gap-3">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                          <div>
                            <p className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200">{statusLabel(entry.new_status)}{entry.old_status ? ` from ${statusLabel(entry.old_status)}` : ''}</p>
                            {entry.notes && <p className="text-sm text-slate-500">{entry.notes}</p>}
                            <p className="text-xs text-slate-400">{formatDate(entry.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><MessageSquare size={16} /> Conversation</h3>
                    <div className="space-y-3">
                      {(selectedComplaint.comments || []).map((entry) => (
                        <div key={entry.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                          <div className="flex justify-between gap-3 text-xs"><span className="font-semibold text-slate-700 dark:text-slate-200">{entry.user_name || 'Maintenance team'}</span><span className="text-slate-400">{formatDate(entry.created_at)}</span></div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{entry.comment}</p>
                        </div>
                      ))}
                      {!selectedComplaint.comments?.length && <p className="text-sm text-slate-400">No comments yet.</p>}
                    </div>
                    {selectedComplaint.status !== 'cancelled' && (
                      <form onSubmit={addComment} className="mt-3 flex gap-2">
                        <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a comment or update" className={`${fieldsClass} mt-0`} />
                        <button disabled={actionLoading || !comment.trim()} type="submit" className="shrink-0 rounded-xl bg-indigo-600 px-4 text-white disabled:opacity-50" aria-label="Send comment"><Send size={17} /></button>
                      </form>
                    )}
                  </section>

                  {['completed', 'resolved'].includes(selectedComplaint.status) && (
                    feedbackIsCurrent ? (
                      <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        You marked the resolution as satisfied.
                        {selectedComplaint.feedback?.comment && <p className="mt-1">{selectedComplaint.feedback.comment}</p>}
                      </div>
                    ) : (
                      <form onSubmit={submitFeedback} className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Are you satisfied with the resolution?</h3>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Resolution satisfaction">
                          <button
                            type="button"
                            aria-pressed={feedbackSatisfied === true}
                            onClick={() => setFeedbackSatisfied(true)}
                            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${feedbackSatisfied === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                          >Yes, satisfied</button>
                          <button
                            type="button"
                            aria-pressed={feedbackSatisfied === false}
                            onClick={() => setFeedbackSatisfied(false)}
                            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${feedbackSatisfied === false ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                          >No, still unresolved</button>
                        </div>
                        {feedbackSatisfied === false && <p className="text-xs text-rose-600 dark:text-rose-300">The complaint will be reopened as pending and sent back for follow-up.</p>}
                        <textarea maxLength={2000} rows={2} value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} placeholder="Optional feedback or follow-up details" className={`${fieldsClass} mt-0`} />
                        <button disabled={actionLoading || feedbackSatisfied === null} type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Send feedback</button>
                      </form>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
