'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  FileText,
  BarChart3,
  Plus,
  Search,
  Users,
  Building,
  Layers,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Edit3,
  Sparkles,
  RefreshCw,
  Info,
  Bell,
  Eye,
  Check,
  ChevronRight,
  ShieldCheck,
  X
} from 'lucide-react';
import { api } from '@/lib/api';

interface Template {
  _id: string;
  template_name: string;
  category: string;
  channel: 'SMS' | 'POPUP' | 'BOTH';
  subject?: string;
  body: string;
  dlt_template_id?: string;
  sender_id?: string;
  placeholders?: string[];
  var_mappings?: Array<{ type: 'dynamic' | 'static'; dynamicField: string; staticValue: string }>;
  is_active: boolean;
  createdAt?: string;
}

interface CommunicationLog {
  _id: string;
  channel: 'SMS' | 'POPUP' | 'BOTH';
  title?: string;
  body: string;
  recipient_type: string;
  target_summary: string;
  recipient_count: number;
  recipients: {
    employee_id?: string;
    emp_no?: string;
    name?: string;
    phone_number?: string;
    sms_status: string;
    popup_status: string;
    error_message?: string;
  }[];
  template_id?: { _id: string; template_name: string };
  status: 'SENT' | 'PARTIAL' | 'FAILED' | 'SCHEDULED';
  sent_at: string;
  created_by?: { name?: string; email?: string };
}

interface Department {
  _id: string;
  name?: string;
  department_name?: string;
  code?: string;
}

interface Division {
  _id: string;
  name?: string;
  division_name?: string;
  code?: string;
}

interface EmployeeGroup {
  _id: string;
  name?: string;
}

interface EmployeeItem {
  _id: string;
  emp_no: string;
  employee_name: string;
  department_id?: { department_name?: string };
}

interface MultiSelectOption {
  id: string;
  label: string;
}

function MultiSelectDropdown({
  label,
  placeholder = 'All Options',
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  placeholder?: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    return options.filter((o) => o.label.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [options, searchQuery]);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    onChange(options.map((o) => o.id));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        {selectedIds.length > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
            {selectedIds.length} Selected
          </span>
        )}
      </label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[42px] p-2.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shadow-sm text-left hover:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition"
      >
        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
          {selectedIds.length === 0 ? (
            <span className="text-slate-500 font-normal">{placeholder}</span>
          ) : (
            selectedIds.slice(0, 2).map((id) => {
              const opt = options.find((o) => o.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 max-w-[140px] truncate"
                >
                  <span className="truncate">{opt?.label || id}</span>
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-rose-600 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(id);
                    }}
                  />
                </span>
              );
            })
          )}
          {selectedIds.length > 2 && (
            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
              +{selectedIds.length - 2} more
            </span>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-2.5 space-y-2 text-xs animate-fadeIn">
          {/* Search Input */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 gap-2">
            <input
              type="text"
              placeholder={`Search ${label.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-600 px-1">
            <button type="button" onClick={selectAll} className="hover:underline">Select All ({options.length})</button>
            <button type="button" onClick={clearAll} className="hover:underline text-rose-600">Clear All</button>
          </div>

          {/* Options List */}
          <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-slate-400 text-[11px]">No options found</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs font-semibold ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOption(opt.id)}
                        className="rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommunicationsView() {
  const [activeTab, setActiveTab] = useState<'send' | 'templates' | 'reports'>('send');

  // Metadata
  const [departments, setDepartments] = useState<Department[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [employeesList, setEmployeesList] = useState<EmployeeItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  // TAB 1: SEND FORM STATE
  const [channel, setChannel] = useState<'SMS' | 'POPUP' | 'BOTH'>('BOTH');
  const [targetAudienceTab, setTargetAudienceTab] = useState<'FILTERS' | 'SPECIFIC'>('FILTERS');
  const [selectedFilterDivisions, setSelectedFilterDivisions] = useState<string[]>([]);
  const [selectedFilterDepartments, setSelectedFilterDepartments] = useState<string[]>([]);
  const [selectedFilterGroups, setSelectedFilterGroups] = useState<string[]>([]);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [customNumbersInput, setCustomNumbersInput] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sendTitle, setSendTitle] = useState<string>('');
  const [sendBody, setSendBody] = useState<string>('');
  const [dltTemplateId, setDltTemplateId] = useState<string>('');
  const [senderId, setSenderId] = useState<string>('PYDAHK');
  const [empSearch, setEmpSearch] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<any>(null);

  // DLT Variable Mappings State
  const [varMappings, setVarMappings] = useState<Array<{ type: 'dynamic' | 'static'; dynamicField: string; staticValue: string }>>([]);

  // TAB 2: TEMPLATES STATE
  const [templateSearch, setTemplateSearch] = useState<string>('');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>('ALL');
  const [showTemplateModal, setShowTemplateModal] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [modalForm, setModalForm] = useState({
    template_name: '',
    category: 'GENERAL',
    channel: 'SMS' as 'SMS' | 'POPUP' | 'BOTH',
    subject: '',
    body: '',
    dlt_template_id: '',
    sender_id: 'PYDAHK',
    var_mappings: [] as Array<{ type: 'dynamic' | 'static'; dynamicField: string; staticValue: string }>,
    is_active: true
  });
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);

  // Detect count of {#var#} in modalForm.body
  const modalDetectedVarCount = useMemo(() => {
    const matches = modalForm.body.match(/\{#var#\}/gi);
    return matches ? matches.length : 0;
  }, [modalForm.body]);

  // Sync modal var_mappings when count changes
  useEffect(() => {
    setModalForm((prev) => {
      const currentMappings = Array.isArray(prev.var_mappings) ? [...prev.var_mappings] : [];
      if (currentMappings.length < modalDetectedVarCount) {
        const updated = [...currentMappings];
        for (let i = updated.length; i < modalDetectedVarCount; i++) {
          updated.push({ type: 'dynamic', dynamicField: 'employee_name', staticValue: '' });
        }
        return { ...prev, var_mappings: updated };
      } else if (currentMappings.length > modalDetectedVarCount) {
        return { ...prev, var_mappings: currentMappings.slice(0, modalDetectedVarCount) };
      }
      return prev;
    });
  }, [modalDetectedVarCount]);

  // TAB 3: REPORTS STATE
  const [reports, setReports] = useState<CommunicationLog[]>([]);
  const [reportsPagination, setReportsPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [reportsSearch, setReportsSearch] = useState<string>('');
  const [reportsStatus, setReportsStatus] = useState<string>('');
  const [reportsChannel, setReportsChannel] = useState<string>('');
  const [reportsStartDate, setReportsStartDate] = useState<string>('');
  const [reportsEndDate, setReportsEndDate] = useState<string>('');
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [stats, setStats] = useState<any>(null);
  const [selectedLogDetail, setSelectedLogDetail] = useState<CommunicationLog | null>(null);
  const [reportViewMode, setReportViewMode] = useState<'individual' | 'batch'>('individual');

  // Variable Placeholders Chips
  const VARIABLE_CHIPS = [
    { label: 'DLT Token', value: '{#var#}' },
    { label: 'Employee Name', value: '{employee_name}' },
    { label: 'Emp No', value: '{emp_no}' },
    { label: 'Department', value: '{department}' },
    { label: 'Company Name', value: '{company_name}' },
    { label: 'Current Date', value: '{date}' }
  ];

  // Dynamically filter departments according to selected divisions
  const availableDepartments = useMemo(() => {
    if (!selectedFilterDivisions || selectedFilterDivisions.length === 0) {
      return departments;
    }

    const deptIdsSet = new Set<string>();

    // 1. From division.departments array if present
    divisions.forEach((div) => {
      if (selectedFilterDivisions.includes(div._id)) {
        if (Array.isArray((div as any).departments)) {
          (div as any).departments.forEach((dept: any) => {
            const dId = typeof dept === 'object' && dept ? dept._id : dept;
            if (dId) deptIdsSet.add(String(dId));
          });
        }
      }
    });

    // 2. From employees matching selected divisions
    employeesList.forEach((emp: any) => {
      const empDivId = String(emp.division_id?._id || emp.division_id || '');
      if (selectedFilterDivisions.includes(empDivId)) {
        const empDeptId = String(emp.department_id?._id || emp.department_id || '');
        if (empDeptId) deptIdsSet.add(empDeptId);
      }
    });

    if (deptIdsSet.size === 0) {
      return departments;
    }

    return departments.filter((dept) => deptIdsSet.has(String(dept._id)));
  }, [departments, divisions, employeesList, selectedFilterDivisions]);

  // Prune selected departments if selected divisions change and departments become invalid
  useEffect(() => {
    if (selectedFilterDivisions.length > 0 && selectedFilterDepartments.length > 0) {
      const validDeptIds = new Set(availableDepartments.map((d) => String(d._id)));
      setSelectedFilterDepartments((prev) => prev.filter((id) => validDeptIds.has(id)));
    }
  }, [selectedFilterDivisions, availableDepartments]);

  // Estimated Recipients Count calculation
  const estimatedRecipientsCount = useMemo(() => {
    if (targetAudienceTab === 'SPECIFIC') {
      return selectedEmps.length;
    }

    return employeesList.filter((emp: any) => {
      if (selectedFilterDivisions.length > 0) {
        const empDivId = String(emp.division_id?._id || emp.division_id || '');
        if (!selectedFilterDivisions.includes(empDivId)) return false;
      }
      if (selectedFilterDepartments.length > 0) {
        const empDeptId = String(emp.department_id?._id || emp.department_id || '');
        if (!selectedFilterDepartments.includes(empDeptId)) return false;
      }
      if (selectedFilterGroups.length > 0) {
        const empGroupId = String(emp.employee_group_id?._id || emp.employee_group || emp.employee_group_id || '');
        if (!selectedFilterGroups.includes(empGroupId)) return false;
      }
      return true;
    }).length;
  }, [targetAudienceTab, selectedEmps, employeesList, selectedFilterDivisions, selectedFilterDepartments, selectedFilterGroups]);

  // Detect count of {#var#} in sendBody
  const detectedVarCount = useMemo(() => {
    const matches = sendBody.match(/\{#var#\}/gi);
    return matches ? matches.length : 0;
  }, [sendBody]);

  // Sync varMappings when count changes
  useEffect(() => {
    setVarMappings((prev) => {
      const updated = [...prev];
      if (updated.length < detectedVarCount) {
        for (let i = updated.length; i < detectedVarCount; i++) {
          updated.push({ type: 'dynamic', dynamicField: 'employee_name', staticValue: '' });
        }
        return updated;
      } else if (updated.length > detectedVarCount) {
        return updated.slice(0, detectedVarCount);
      }
      return prev;
    });
  }, [detectedVarCount]);

  // Flatten reports into individual recipient rows
  const individualRecipientRows = useMemo(() => {
    const list: Array<{
      id: string;
      logId: string;
      sent_at: string;
      category: string;
      title: string;
      body: string;
      channel: string;
      recipientName: string;
      empNo?: string;
      phoneNumber: string;
      status: string;
      errorMessage?: string;
      rawLog: CommunicationLog;
    }> = [];

    reports.forEach((log) => {
      const cat = (log as any).category || (log as any).template_id?.category || 'GENERAL';
      if (Array.isArray(log.recipients) && log.recipients.length > 0) {
        log.recipients.forEach((rec, idx) => {
          const itemStatus = rec.sms_status !== 'NOT_APPLICABLE' ? rec.sms_status : rec.popup_status;
          list.push({
            id: `${log._id}-${idx}`,
            logId: log._id,
            sent_at: log.sent_at,
            category: cat,
            title: log.title || '',
            body: log.body || log.title || 'Announcement',
            channel: log.channel,
            recipientName: rec.name || 'Recipient',
            empNo: rec.emp_no || '',
            phoneNumber: rec.phone_number || '',
            status: itemStatus,
            errorMessage: rec.error_message || '',
            rawLog: log
          });
        });
      } else {
        list.push({
          id: log._id,
          logId: log._id,
          sent_at: log.sent_at,
          category: cat,
          title: log.title || '',
          body: log.body || log.title || 'Announcement',
          channel: log.channel,
          recipientName: log.target_summary || log.recipient_type,
          phoneNumber: '',
          status: log.status,
          errorMessage: '',
          rawLog: log
        });
      }
    });

    return list.filter((r) => {
      if (reportsStatus && r.status !== reportsStatus) return false;
      if (reportsChannel && r.channel !== reportsChannel && r.channel !== 'BOTH') return false;
      if (reportsSearch.trim()) {
        const q = reportsSearch.toLowerCase();
        return (
          r.recipientName.toLowerCase().includes(q) ||
          (r.empNo && r.empNo.toLowerCase().includes(q)) ||
          r.phoneNumber.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports, reportsSearch, reportsStatus, reportsChannel]);

  useEffect(() => {
    fetchMetadata();
    fetchTemplates();
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReports(1);
      fetchStats();
    }
  }, [activeTab, reportsSearch, reportsStatus, reportsChannel, reportsStartDate, reportsEndDate]);

  const fetchMetadata = async () => {
    try {
      const [deptRes, divRes, groupRes, empRes] = await Promise.all([
        api.getDepartments ? api.getDepartments() : Promise.resolve({ success: false, data: [] }),
        api.getDivisions ? api.getDivisions() : Promise.resolve({ success: false, data: [] }),
        api.getEmployeeGroups ? api.getEmployeeGroups() : Promise.resolve({ success: false, data: [] }),
        api.getEmployees ? api.getEmployees({ limit: 1000, is_active: true }) : Promise.resolve({ success: false, data: [] })
      ]);

      if (deptRes?.success && Array.isArray(deptRes.data)) setDepartments(deptRes.data);
      if (divRes?.success && Array.isArray(divRes.data)) setDivisions(divRes.data);
      if (groupRes?.success && Array.isArray(groupRes.data)) setGroups(groupRes.data);

      const empArr = empRes?.data?.employees || empRes?.data || [];
      if (Array.isArray(empArr)) setEmployeesList(empArr);
    } catch (err) {
      console.error('Failed to load metadata:', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.getSmsTemplates();
      if (res?.success && Array.isArray(res.data)) {
        setTemplates(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  };

  const fetchReports = async (page = 1) => {
    setIsLoadingReports(true);
    try {
      const res = await api.getCommunicationReports({
        page,
        limit: 10,
        search: reportsSearch,
        status: reportsStatus,
        channel: reportsChannel,
        startDate: reportsStartDate,
        endDate: reportsEndDate
      });
      if (res?.success && res.data) {
        setReports(res.data.logs || []);
        setReportsPagination(res.data.pagination || { total: 0, page: 1, pages: 1 });
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.getCommunicationStats();
      if (res?.success && res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const t = templates.find((item) => item._id === templateId);
    if (t) {
      setSendBody(t.body);
      if (t.subject) setSendTitle(t.subject);
      if (t.channel) setChannel(t.channel);
      if (t.dlt_template_id) setDltTemplateId(t.dlt_template_id);
      if (t.sender_id) setSenderId(t.sender_id);
      if (Array.isArray(t.var_mappings)) setVarMappings(t.var_mappings);
    }
  };

  const handleInsertVariable = (varValue: string, isModal = false) => {
    if (isModal) {
      setModalForm((prev) => ({ ...prev, body: prev.body + ' ' + varValue }));
    } else {
      setSendBody((prev) => prev + ' ' + varValue);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendBody.trim()) {
      alert('Please enter message content.');
      return;
    }

    if (targetAudienceTab === 'SPECIFIC' && selectedEmps.length === 0) {
      alert('Please select at least one employee.');
      return;
    }


    setIsSending(true);
    setSendResult(null);

    try {
      const payload = {
        channel,
        recipientType: targetAudienceTab === 'FILTERS' ? 'FILTERS' : 'SPECIFIC_EMPLOYEES',
        divisionIds: targetAudienceTab === 'FILTERS' ? selectedFilterDivisions : [],
        departmentIds: targetAudienceTab === 'FILTERS' ? selectedFilterDepartments : [],
        groupIds: targetAudienceTab === 'FILTERS' ? selectedFilterGroups : [],
        employeeIds: targetAudienceTab === 'SPECIFIC' ? selectedEmps : [],
        title: sendTitle || 'Announcement',
        body: sendBody,
        templateId: selectedTemplateId || null,
        dltTemplateId,
        senderId,
        varMappings
      };

      const res = await api.sendBroadcast(payload);
      if (res?.success) {
        setSendResult(res.data);
        fetchStats();
        // Reset form
        setSelectedTemplateId('');
        setSendTitle('');
        setSendBody('');
        setSelectedEmps([]);
        setSelectedFilterDivisions([]);
        setSelectedFilterDepartments([]);
        setSelectedFilterGroups([]);
        setVarMappings([]);
        // Auto-refresh page after sending message
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        alert(res?.message || 'Failed to send broadcast message.');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while sending broadcast.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.template_name || !modalForm.body) {
      alert('Template Name and Body are required.');
      return;
    }

    setIsSavingTemplate(true);
    try {
      if (editingTemplate) {
        const res = await api.updateSmsTemplate(editingTemplate._id, modalForm);
        if (res?.success) {
          fetchTemplates();
          setShowTemplateModal(false);
        } else alert(res?.message || 'Failed to update template');
      } else {
        const res = await api.createSmsTemplate(modalForm);
        if (res?.success) {
          fetchTemplates();
          setShowTemplateModal(false);
        } else alert(res?.message || 'Failed to create template');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const res = await api.deleteSmsTemplate(id);
      if (res?.success) {
        fetchTemplates();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete template');
    }
  };

  const openNewTemplateModal = () => {
    setEditingTemplate(null);
    setModalForm({
      template_name: '',
      category: 'GENERAL',
      channel: 'SMS',
      subject: '',
      body: '',
      dlt_template_id: '',
      sender_id: 'PYDAHK',
      var_mappings: [],
      is_active: true
    });
    setShowTemplateModal(true);
  };

  const openEditTemplateModal = (t: Template) => {
    setEditingTemplate(t);
    setModalForm({
      template_name: t.template_name,
      category: t.category || 'GENERAL',
      channel: t.channel || 'SMS',
      subject: t.subject || '',
      body: t.body || '',
      dlt_template_id: t.dlt_template_id || '',
      sender_id: t.sender_id || 'PYDAHK',
      var_mappings: Array.isArray(t.var_mappings) ? t.var_mappings : [],
      is_active: t.is_active ?? true
    });
    setShowTemplateModal(true);
  };

  const filteredEmployeesList = useMemo(() => {
    if (!empSearch.trim()) return employeesList.slice(0, 50);
    const q = empSearch.toLowerCase();
    return employeesList.filter(
      (e) =>
        e.employee_name.toLowerCase().includes(q) ||
        e.emp_no.toLowerCase().includes(q)
    );
  }, [employeesList, empSearch]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesCategory =
        templateCategoryFilter === 'ALL' || t.category === templateCategoryFilter;
      const matchesSearch =
        !templateSearch ||
        t.template_name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.body.toLowerCase().includes(templateSearch.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [templates, templateCategoryFilter, templateSearch]);

  const smsCharCount = sendBody.length;
  const smsSegments = Math.ceil(smsCharCount / 160) || 1;

  return (
    <div className="w-full space-y-6 font-sans text-slate-900 dark:text-slate-100">
      
      {/* Clean Header with Heading on Left and Tabs on Top Right */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Communications
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Manage SMS templates, broadcast messages, and view delivery reports
          </p>
        </div>

        {/* Navigation Tabs Aligned Top Right */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl shadow-inner border border-slate-200/60 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('send')}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'send'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Send Messages
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'templates'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            SMS Templates ({templates.length})
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'reports'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            SMS Reports
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SEND MESSAGES */}
      {/* ========================================================================= */}
      {activeTab === 'send' && (
        <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <form onSubmit={handleSendBroadcast} className="space-y-6">
            
            {/* Target Audience Selector matching UI reference */}
            <div className="bg-slate-50/60 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-4">
              
              {/* Header with Sub-tabs and Est. Recipients Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-1.5 bg-slate-200/60 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTargetAudienceTab('FILTERS')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      targetAudienceTab === 'FILTERS'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Target By Filters
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetAudienceTab('SPECIFIC')}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                      targetAudienceTab === 'SPECIFIC'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Specific Employees
                  </button>
                </div>

                <div className="px-3.5 py-1.5 rounded-full bg-emerald-100/80 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-extrabold text-xs border border-emerald-300 dark:border-emerald-800 w-fit self-end sm:self-auto shadow-sm">
                  Est. Recipients: {estimatedRecipientsCount}
                </div>
              </div>

              {/* TAB 1: FILTERS (Stacked dropdowns for Divisions, Departments, Employee Groups) */}
              {targetAudienceTab === 'FILTERS' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Leave fields empty to target everyone.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Multi-select Divisions Dropdown */}
                    <MultiSelectDropdown
                      label="Divisions"
                      placeholder="All Divisions"
                      options={divisions.map((d) => ({
                        id: d._id,
                        label: d.name || d.division_name || d.code || 'Division',
                      }))}
                      selectedIds={selectedFilterDivisions}
                      onChange={setSelectedFilterDivisions}
                    />

                    {/* Multi-select Departments Dropdown */}
                    <MultiSelectDropdown
                      label="Departments"
                      placeholder={selectedFilterDivisions.length > 0 ? "Departments in Selected Divisions" : "All Departments"}
                      options={availableDepartments.map((d) => ({
                        id: d._id,
                        label: d.name || d.department_name || d.code || 'Department',
                      }))}
                      selectedIds={selectedFilterDepartments}
                      onChange={setSelectedFilterDepartments}
                    />

                    {/* Multi-select Employee Groups Dropdown */}
                    <MultiSelectDropdown
                      label="Employee Groups"
                      placeholder="All Employee Groups"
                      options={groups.map((g) => ({
                        id: g._id,
                        label: g.name || (g as any).group_name || 'Group',
                      }))}
                      selectedIds={selectedFilterGroups}
                      onChange={setSelectedFilterGroups}
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: SPECIFIC EMPLOYEES */}
              {targetAudienceTab === 'SPECIFIC' && (
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 animate-fadeIn">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search employee by name or ID..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {filteredEmployeesList.map((emp) => (
                      <label key={emp._id} className="flex items-center justify-between p-2 text-xs rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedEmps.includes(emp._id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedEmps([...selectedEmps, emp._id]);
                              else setSelectedEmps(selectedEmps.filter((id) => id !== emp._id));
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">{emp.employee_name}</span>
                            <span className="text-slate-400 ml-2">({emp.emp_no})</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{emp.department_id?.department_name || ''}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium">Selected: {selectedEmps.length} employee(s)</div>
                </div>
              )}

            </div>

            {/* 2. Select SMS Template */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                2. Select SMS Template *
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full p-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 cursor-pointer shadow-sm"
              >
                <option value="">-- Choose SMS Template --</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    [{t.category}] {t.template_name} ({t.channel})
                  </option>
                ))}
              </select>
            </div>

            {/* Template Loaded Content & DLT Variables Configurator */}
            {selectedTemplateId ? (
              <div className="space-y-4 animate-fadeIn">
                {/* Template Message Preview */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      {sendTitle || templates.find(t => t._id === selectedTemplateId)?.template_name || 'Selected Template'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono">
                        DLT ID: {dltTemplateId || 'N/A'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId('');
                          setSendTitle('');
                          setSendBody('');
                          setDltTemplateId('');
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200/60 dark:border-slate-800">
                    {sendBody}
                  </div>
                </div>

                {/* DLT VARIABLES CONFIGURATOR PANEL IN SEND SMS TAB */}
                {detectedVarCount > 0 && (
                  <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 space-y-3 max-w-full overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Configure DLT Variables ({detectedVarCount} variable{detectedVarCount > 1 ? 's' : ''} found in template)</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                        Token format: &#123;#var#&#125;
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                      {varMappings.map((mapping, idx) => (
                        <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs max-w-full overflow-hidden">
                          <div className="sm:col-span-2 font-bold text-slate-700 dark:text-slate-300 flex items-center">
                            <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono text-[11px]">
                              Var #{idx + 1}
                            </span>
                          </div>

                          <div className="sm:col-span-5 min-w-0">
                            {/* Mode selection */}
                            <select
                              value={mapping.type || 'dynamic'}
                              onChange={(e) => {
                                const newType = e.target.value as 'dynamic' | 'static';
                                setVarMappings(prev => prev.map((m, i) => i === idx ? { ...m, type: newType } : m));
                              }}
                              className="w-full truncate p-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer outline-none"
                            >
                              <option value="dynamic">Dynamic (Employee Data)</option>
                              <option value="static">Static Custom Text</option>
                            </select>
                          </div>

                          <div className="sm:col-span-5 min-w-0">
                            {/* Value config */}
                            {mapping.type === 'static' ? (
                              <input
                                type="text"
                                placeholder={`Enter fixed value for Var #${idx + 1}...`}
                                value={mapping.staticValue || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setVarMappings(prev => prev.map((m, i) => i === idx ? { ...m, staticValue: val } : m));
                                }}
                                className="w-full truncate p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                              />
                            ) : (
                              <select
                                value={mapping.dynamicField || 'employee_name'}
                                onChange={(e) => {
                                  const newField = e.target.value;
                                  setVarMappings(prev => prev.map((m, i) => i === idx ? { ...m, dynamicField: newField } : m));
                                }}
                                className="w-full truncate p-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer outline-none"
                              >
                                <option value="employee_name">Employee Name ({'{employee_name}'})</option>
                                <option value="emp_no">Employee Number ({'{emp_no}'})</option>
                                <option value="department">Department Name ({'{department}'})</option>
                                <option value="company_name">Company Name (Pydah Group)</option>
                                <option value="date">Current Date ({'{date}'})</option>
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-500">
                Please select an SMS template from the dropdown above to configure variables and send message.
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSending}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Broadcasting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Send Broadcast Now
                  </>
                )}
              </button>
            </div>

          </form>

          {/* Broadcast Result Banner */}
          {sendResult && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Broadcast Executed Successfully ({sendResult.status})
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-2">
                <div className="bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-slate-500">Total Targets:</span> <strong>{sendResult.totalRecipients}</strong>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-slate-500">SMS Sent:</span> <strong className="text-emerald-600">{sendResult.smsSent}</strong>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-slate-500">Popups Sent:</span> <strong className="text-teal-600">{sendResult.popupsSent}</strong>
                </div>
                <div className="bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-slate-500">Failures:</span> <strong className="text-rose-600">{sendResult.smsFailed + sendResult.popupsFailed}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SMS TEMPLATES */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                />
              </div>

              <select
                value={templateCategoryFilter}
                onChange={(e) => setTemplateCategoryFilter(e.target.value)}
                className="text-xs py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
              >
                <option value="ALL">All Categories</option>
                <option value="GENERAL">General</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="PAYROLL">Payroll</option>
                <option value="EMERGENCY">Emergency</option>
                <option value="GREETINGS">Greetings</option>
              </select>
            </div>

            <button
              onClick={openNewTemplateModal}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" /> Create New Template
            </button>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
              <FileText className="w-12 h-12 mx-auto text-slate-300" />
              <div className="text-base font-bold text-slate-700 dark:text-slate-300">No Templates Found</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">Create pre-configured DLT templates using &#123;#var#&#125; variables for attendance, payroll, or greetings.</p>
              <button
                onClick={openNewTemplateModal}
                className="inline-flex items-center gap-2 bg-emerald-600 text-white text-xs font-bold py-2 px-4 rounded-xl"
              >
                <Plus className="w-4 h-4" /> Add First Template
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((t) => (
                <div
                  key={t._id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {t.category || 'GENERAL'}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1.5">{t.template_name}</h3>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {t.subject && (
                      <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Subject: {t.subject}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 font-mono leading-relaxed line-clamp-4">
                      {t.body}
                    </p>

                    {t.dlt_template_id && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> DLT ID: {t.dlt_template_id}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => {
                        handleSelectTemplate(t._id);
                        setActiveTab('send');
                      }}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      Use to Send <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditTemplateModal(t)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteTemplate(t._id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingTemplate ? 'Edit SMS Template' : 'Create New SMS Template'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-600">Template Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DLT Attendance Alert"
                    value={modalForm.template_name}
                    onChange={(e) => setModalForm({ ...modalForm, template_name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-600">Category</label>
                  <select
                    value={modalForm.category}
                    onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="GENERAL">General</option>
                    <option value="ATTENDANCE">Attendance</option>
                    <option value="PAYROLL">Payroll</option>
                    <option value="EMERGENCY">Emergency</option>
                    <option value="GREETINGS">Greetings</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-600">Default Channel</label>
                  <select
                    value={modalForm.channel}
                    onChange={(e) => setModalForm({ ...modalForm, channel: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="SMS">SMS Gateway</option>
                    <option value="POPUP">In-App Popup</option>
                    <option value="BOTH">Both</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-slate-600">Sender ID</label>
                  <input
                    type="text"
                    placeholder="PYDAHK"
                    value={modalForm.sender_id}
                    onChange={(e) => setModalForm({ ...modalForm, sender_id: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-600">Subject / Title (Optional)</label>
                <input
                  type="text"
                  placeholder="Subject line for notification"
                  value={modalForm.subject}
                  onChange={(e) => setModalForm({ ...modalForm, subject: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-600">Template Message Body *</label>
                  <button
                    type="button"
                    onClick={() => handleInsertVariable('{#var#}', true)}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300"
                  >
                    + Add DLT Variable &#123;#var#&#125;
                  </button>
                </div>

                <textarea
                  rows={4}
                  required
                  placeholder="Dear {#var#}, your attendance for {#var#} has been marked. Regards, {#var#}"
                  value={modalForm.body}
                  onChange={(e) => setModalForm({ ...modalForm, body: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              {/* DLT VARIABLES CONFIGURATOR IN TEMPLATE MODAL */}
              {modalDetectedVarCount > 0 && (
                <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 space-y-3 max-w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Configure DLT Variables ({modalDetectedVarCount} variable{modalDetectedVarCount > 1 ? 's' : ''} found in template)</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                      Token format: &#123;#var#&#125;
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                    {modalForm.var_mappings.map((mapping, idx) => (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs max-w-full overflow-hidden">
                        <div className="sm:col-span-2 font-bold text-slate-700 dark:text-slate-300 flex items-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-mono text-[11px]">
                            Var #{idx + 1}
                          </span>
                        </div>

                        <div className="sm:col-span-5 min-w-0">
                          {/* Mode selection */}
                          <select
                            value={mapping.type || 'dynamic'}
                            onChange={(e) => {
                              const newType = e.target.value as 'dynamic' | 'static';
                              setModalForm(prev => ({
                                ...prev,
                                var_mappings: prev.var_mappings.map((m, i) => i === idx ? { ...m, type: newType } : m)
                              }));
                            }}
                            className="w-full truncate p-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer outline-none"
                          >
                            <option value="dynamic">Dynamic (Employee Data)</option>
                            <option value="static">Static Custom Text</option>
                          </select>
                        </div>

                        <div className="sm:col-span-5 min-w-0">
                          {/* Value config */}
                          {mapping.type === 'static' ? (
                            <input
                              type="text"
                              placeholder={`Enter fixed value for Var #${idx + 1}...`}
                              value={mapping.staticValue || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setModalForm(prev => ({
                                  ...prev,
                                  var_mappings: prev.var_mappings.map((m, i) => i === idx ? { ...m, staticValue: val } : m)
                                }));
                              }}
                              className="w-full truncate p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none"
                            />
                          ) : (
                            <select
                              value={mapping.dynamicField || 'employee_name'}
                              onChange={(e) => {
                                const newField = e.target.value;
                                setModalForm(prev => ({
                                  ...prev,
                                  var_mappings: prev.var_mappings.map((m, i) => i === idx ? { ...m, dynamicField: newField } : m)
                                }));
                              }}
                              className="w-full truncate p-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer outline-none"
                            >
                              <option value="employee_name">Employee Name ({'{employee_name}'})</option>
                              <option value="emp_no">Employee Number ({'{emp_no}'})</option>
                              <option value="department">Department Name ({'{department}'})</option>
                              <option value="company_name">Company Name (Pydah Group)</option>
                              <option value="date">Current Date ({'{date}'})</option>
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1 text-slate-600">DLT Template ID (Indian Telecom DLT)</label>
                <input
                  type="text"
                  placeholder="e.g. 1707176526611076697"
                  value={modalForm.dlt_template_id}
                  onChange={(e) => setModalForm({ ...modalForm, dlt_template_id: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="modalIsActive"
                  checked={modalForm.is_active}
                  onChange={(e) => setModalForm({ ...modalForm, is_active: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="modalIsActive" className="font-semibold text-slate-700 cursor-pointer">
                  Set template as active
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTemplate}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                >
                  {isSavingTemplate ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REPORTS & ANALYTICS */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Top Analytics Metric Cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                  <Send className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total Broadcasts</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats.totalBroadcasts || 0}</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-teal-50 dark:bg-teal-950/60 text-teal-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Total Recipients</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats.totalRecipients || 0}</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                  <Phone className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">SMS Gateway Sent</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats.smsCount || 0}</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/60 text-amber-600 rounded-xl">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-slate-500">Popup Toasts Delivered</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats.popupCount || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-60">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search recipient, mobile, message..."
                  value={reportsSearch}
                  onChange={(e) => setReportsSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                />
              </div>

              <select
                value={reportsStatus}
                onChange={(e) => setReportsStatus(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
              >
                <option value="">All Statuses</option>
                <option value="SENT">Sent</option>
                <option value="PARTIAL">Partial</option>
                <option value="FAILED">Failed</option>
                <option value="SKIPPED">Skipped</option>
              </select>

              <select
                value={reportsChannel}
                onChange={(e) => setReportsChannel(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
              >
                <option value="">All Channels</option>
                <option value="SMS">SMS</option>
                <option value="POPUP">Popup</option>
                <option value="BOTH">Both</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  onClick={() => setReportViewMode('individual')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    reportViewMode === 'individual'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Individual Rows
                </button>
                <button
                  onClick={() => setReportViewMode('batch')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    reportViewMode === 'batch'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Batch Summary
                </button>
              </div>

              <button
                onClick={() => fetchReports(1)}
                className="p-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReports ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 uppercase text-[10px] font-bold text-slate-500 tracking-wider">
                  {reportViewMode === 'individual' ? (
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Recipient Name</th>
                      <th className="py-3 px-4">Mobile Number</th>
                      <th className="py-3 px-4">Message Content</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Title / Summary</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Audience</th>
                      <th className="py-3 px-4 text-center">Recipients</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoadingReports ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading reports...
                      </td>
                    </tr>
                  ) : reportViewMode === 'individual' ? (
                    individualRecipientRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No individual message logs found.
                        </td>
                      </tr>
                    ) : (
                      individualRecipientRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {new Date(row.sent_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {row.category}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                            <div>{row.recipientName}</div>
                            {row.empNo && <div className="text-[10px] text-slate-400 font-mono font-normal">ID: {row.empNo}</div>}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                            {row.phoneNumber || <span className="text-slate-400 italic">No number</span>}
                          </td>

                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs break-words line-clamp-2" title={row.body || row.title}>
                              {row.body || row.title || '—'}
                            </div>
                            {row.title && row.title !== row.body && row.title !== 'Announcement' && (
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate mt-0.5">{row.title}</div>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              row.channel === 'SMS' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                              row.channel === 'POPUP' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                              'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400'
                            }`}>
                              {row.channel}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 w-fit ${
                              row.status === 'SENT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                              row.status === 'FAILED' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            }`}>
                              {row.status === 'SENT' && <CheckCircle2 className="w-3 h-3" />}
                              {row.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                              {row.status === 'SKIPPED' && <AlertCircle className="w-3 h-3" />}
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No broadcast logs found.
                      </td>
                    </tr>
                  ) : (
                    reports.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {new Date(log.sent_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {(log as any).category || (log as any).template_id?.category || 'GENERAL'}
                          </span>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs break-words line-clamp-2" title={log.body || log.title}>
                            {log.body || log.title || '—'}
                          </div>
                          {log.title && log.title !== log.body && log.title !== 'Announcement' && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate mt-0.5">{log.title}</div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            log.channel === 'SMS' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            log.channel === 'POPUP' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                            'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400'
                          }`}>
                            {log.channel}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-medium text-slate-600 dark:text-slate-300">
                          {log.target_summary || log.recipient_type}
                        </td>

                        <td className="py-3 px-4 text-center font-bold text-slate-700 dark:text-slate-200">
                          {log.recipient_count}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] flex items-center gap-1 w-fit ${
                            log.status === 'SENT' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            log.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' :
                            'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}>
                            {log.status === 'SENT' && <CheckCircle2 className="w-3 h-3" />}
                            {log.status === 'PARTIAL' && <AlertCircle className="w-3 h-3" />}
                            {log.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                            {log.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedLogDetail(log)}
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            {reportsPagination.pages > 1 && (
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Showing page {reportsPagination.page} of {reportsPagination.pages} ({reportsPagination.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={reportsPagination.page <= 1}
                    onClick={() => fetchReports(reportsPagination.page - 1)}
                    className="px-3 py-1 rounded border disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={reportsPagination.page >= reportsPagination.pages}
                    onClick={() => fetchReports(reportsPagination.page + 1)}
                    className="px-3 py-1 rounded border disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RECIPIENT LOG DETAILS MODAL */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Broadcast Log Details
                </h3>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {selectedLogDetail._id}
                </div>
              </div>
              <button onClick={() => setSelectedLogDetail(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto pr-1">
              <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                  {selectedLogDetail.body || selectedLogDetail.title || '—'}
                </div>
                {selectedLogDetail.title && selectedLogDetail.title !== selectedLogDetail.body && selectedLogDetail.title !== 'Announcement' && (
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium pt-1">
                    Title: {selectedLogDetail.title}
                  </div>
                )}
              </div>

              <div className="font-bold text-slate-700 dark:text-slate-300 pt-2">
                Recipient Audit Trail ({selectedLogDetail.recipients.length}):
              </div>

              <div className="space-y-1.5">
                {selectedLogDetail.recipients.map((rec, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{rec.name || 'Recipient'}</span>
                      {rec.emp_no && <span className="text-slate-400 ml-1.5">({rec.emp_no})</span>}
                      {rec.phone_number && <div className="text-[11px] text-slate-400 font-mono">{rec.phone_number}</div>}
                    </div>

                    <div className="text-right">
                      {rec.sms_status !== 'NOT_APPLICABLE' && (
                        <div className={`text-[10px] font-bold ${rec.sms_status === 'SENT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          SMS: {rec.sms_status}
                        </div>
                      )}
                      {rec.popup_status !== 'NOT_APPLICABLE' && (
                        <div className={`text-[10px] font-bold ${rec.popup_status === 'SENT' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          Popup: {rec.popup_status}
                        </div>
                      )}
                      {rec.error_message && (
                        <div className="text-[10px] text-rose-500">{rec.error_message}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
