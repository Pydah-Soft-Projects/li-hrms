'use client';

import { useState, useEffect, useMemo } from 'react';
import { api, Division, Department, Employee, Designation, EmployeeGroup } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import { 
    Download, 
    Loader2, 
    Calendar,
    Filter,
    ChevronRight,
    Users,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Clock,
    Search,
    ChevronLeft,
    LogOut,
    FileText,
    Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
    designation_id?: { _id: string; name: string } | string;
    designation?: { name: string };
    employee_group_id?: { _id: string; name: string };
    doj?: string;
    dynamicFields?: Record<string, any>;
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
  };
}

export default function ResignationReportsTab() {
    const [loadingData, setLoadingData] = useState(false);
    const [loadingExportPdf, setLoadingExportPdf] = useState(false);
    const [loadingExportExcel, setLoadingExportExcel] = useState(false);
    const [fetchingFilters, setFetchingFilters] = useState(false);
    
    // Hierarchy states
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [groups, setGroups] = useState<EmployeeGroup[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    
    // Selection states
    const [divisionIds, setDivisionIds] = useState<string[]>([]);
    const [departmentIds, setDepartmentIds] = useState<string[]>([]);
    const [designationIds, setDesignationIds] = useState<string[]>([]);
    const [groupFilterIds, setGroupFilterIds] = useState<string[]>([]);
    const [employeeIds, setEmployeeIds] = useState<string[]>([]);
    
    // Date/Mode states
    const [dateMode, setDateMode] = useState<'pay_cycle' | 'monthly' | 'range'>('pay_cycle');
    const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
    const [payrollStartDay, setPayrollStartDay] = useState<number>(1);
    const [searchQuery, setSearchQuery] = useState('');

    // Additional Filters
    const [dateFilterTarget, setDateFilterTarget] = useState<'createdAt' | 'leftDate'>('createdAt');
    const [requestTypeFilter, setRequestTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState('');

    // Report data states
    const [allRequests, setAllRequests] = useState<ResignationRequest[]>([]);
    
    // Pagination state for preview table
    const [currentPage, setCurrentPage] = useState(1);
    const limit = 10;

    useEffect(() => {
        loadInitialFilters();
        fetchReportData();
    }, []);

    const loadInitialFilters = async () => {
        setFetchingFilters(true);
        try {
            const [divRes, desRes, grpRes, settingRes] = await Promise.all([
                api.getDivisions(true),
                api.getAllDesignations(),
                api.getEmployeeGroups(true),
                api.getSetting('payroll_cycle_start_day'),
            ]);
            if (divRes.success) setDivisions(divRes.data || []);
            if (desRes.success) setDesignations(desRes.data || []);
            if (grpRes.success) setGroups(grpRes.data || []);
            if (settingRes?.success && settingRes.data?.value) {
                setPayrollStartDay(parseInt(settingRes.data.value));
            }
        } catch (error) {
            console.error('Error loading initial filters:', error);
        } finally {
            setFetchingFilters(false);
        }
    };

    const handleDivisionChange = async (ids: string[]) => {
        setDivisionIds(ids);
        setDepartmentIds([]);
        setEmployeeIds([]);
        setDepartments([]);
        setEmployees([]);

        if (ids.length > 0) {
            try {
                const deptPromises = ids.map(id => api.getDepartments(true, id));
                const results = await Promise.all(deptPromises);
                let allDepts: Department[] = [];
                results.forEach(res => {
                    if (res.success) allDepts = [...allDepts, ...(res.data || [])];
                });
                const uniqueDepts = Array.from(new Map(allDepts.map(item => [item._id, item])).values());
                setDepartments(uniqueDepts);
            } catch (error) {
                console.error('Error loading departments:', error);
            }
        }
    };

    const handleDepartmentChange = async (ids: string[]) => {
        setDepartmentIds(ids);
        setEmployeeIds([]);
        setEmployees([]);

        if (ids.length > 0) {
            try {
                const res = await api.getEmployeesSummary({
                    department_ids: ids.join(','),
                    is_active: true,
                    limit: 5000,
                    page: 1,
                });
                if (res.success) {
                    setEmployees(res.data || []);
                } else {
                    setEmployees([]);
                }
            } catch (error) {
                console.error('Error loading employees:', error);
            }
        }
    };

    const fetchReportData = async () => {
        setLoadingData(true);
        try {
            const res = await api.getResignationRequests();
            if (res.success) {
                setAllRequests(Array.isArray(res.data) ? res.data : []);
            }
        } catch (error) {
            console.error('Error fetching resignation requests:', error);
        } finally {
            setLoadingData(false);
        }
    };

    // Memoized date range based on mode
    const effectiveDates = useMemo(() => {
        if (dateMode === 'monthly') {
            const start = dayjs(`${selectedYear}-${selectedMonth}-01`).format('YYYY-MM-DD');
            const end = dayjs(`${selectedYear}-${selectedMonth}-01`).endOf('month').format('YYYY-MM-DD');
            return { start, end };
        } else if (dateMode === 'pay_cycle') {
            const startDay = payrollStartDay;
            const year = parseInt(selectedYear);
            const month = parseInt(selectedMonth);
            if (startDay === 1) {
                const start = dayjs(`${year}-${month}-01`).format('YYYY-MM-DD');
                const end = dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD');
                return { start, end };
            } else {
                const currentMonthStart = dayjs(`${year}-${month}-${startDay}`);
                const prevMonthStart = currentMonthStart.subtract(1, 'month');
                return {
                    start: prevMonthStart.format('YYYY-MM-DD'),
                    end: currentMonthStart.subtract(1, 'day').format('YYYY-MM-DD')
                };
            }
        }
        return { start: startDate, end: endDate };
    }, [dateMode, selectedMonth, selectedYear, startDate, endDate, payrollStartDay]);

    // Client-side filtering respecting all selected options
    const baseFilteredRequests = useMemo(() => {
        return allRequests.filter((req) => {
            // Search Query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const name = (req.employeeId?.employee_name || 
                              [req.employeeId?.first_name, req.employeeId?.last_name].filter(Boolean).join(' ') || 
                              '').toLowerCase();
                const empNo = (req.emp_no || '').toLowerCase();
                if (!name.includes(query) && !empNo.includes(query)) return false;
            }

            // Division Filter
            if (divisionIds.length > 0) {
                const divId = req.employeeId?.division_id?._id;
                if (!divId || !divisionIds.includes(divId)) return false;
            }

            // Department Filter
            if (departmentIds.length > 0) {
                const deptId = req.employeeId?.department_id?._id;
                if (!deptId || !departmentIds.includes(deptId)) return false;
            }

            // Designation Filter
            if (designationIds.length > 0) {
                const desId = typeof req.employeeId?.designation_id === 'object' 
                    ? req.employeeId?.designation_id?._id 
                    : req.employeeId?.designation_id;
                if (!desId || !designationIds.includes(desId)) return false;
            }

            // Employee Group Filter
            if (groupFilterIds.length > 0) {
                const grpId = req.employeeId?.employee_group_id?._id;
                if (!grpId || !groupFilterIds.includes(grpId)) return false;
            }

            // Employee Filter
            if (employeeIds.length > 0) {
                const empId = req.employeeId?._id;
                if (!empId || !employeeIds.includes(empId)) return false;
            }

            // Request Type Filter
            if (requestTypeFilter && requestTypeFilter !== 'all') {
                const type = req.requestType || 'resignation';
                if (type !== requestTypeFilter) return false;
            }

            // Status Filter
            if (statusFilter) {
                if (statusFilter === 'rejected') {
                    if (!['rejected', 'cancelled'].includes(req.status)) return false;
                } else if (req.status !== statusFilter) {
                    return false;
                }
            }

            // Period Filters based on Target
            const targetDateStr = dateFilterTarget === 'createdAt' ? req.createdAt : req.leftDate;
            if (targetDateStr) {
                const targetDay = dayjs(targetDateStr);
                const startDay = dayjs(effectiveDates.start).startOf('day');
                const endDay = dayjs(effectiveDates.end).endOf('day');
                if (targetDay.isBefore(startDay) || targetDay.isAfter(endDay)) return false;
            } else {
                return false;
            }

            return true;
        });
    }, [allRequests, searchQuery, divisionIds, departmentIds, designationIds, groupFilterIds, employeeIds, requestTypeFilter, statusFilter, dateFilterTarget, effectiveDates]);

    // Stats calculations based on current filtered list
    const reportStats = useMemo(() => {
        const total = baseFilteredRequests.length;
        const approved = baseFilteredRequests.filter(r => r.status === 'approved').length;
        const pending = baseFilteredRequests.filter(r => r.status === 'pending').length;
        const rejected = baseFilteredRequests.filter(r => ['rejected', 'cancelled'].includes(r.status)).length;
        return { total, approved, pending, rejected };
    }, [baseFilteredRequests]);

    // Paginated subset for preview table
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * limit;
        return baseFilteredRequests.slice(start, start + limit);
    }, [baseFilteredRequests, currentPage]);

    // Reset pagination page on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, divisionIds, departmentIds, designationIds, groupFilterIds, employeeIds, requestTypeFilter, statusFilter, dateFilterTarget, effectiveDates]);

    const getEmployeeName = (req: ResignationRequest) => {
        if (!req.employeeId) return req.emp_no || '—';
        if (req.employeeId.employee_name) return req.employeeId.employee_name;
        return [req.employeeId.first_name, req.employeeId.last_name].filter(Boolean).join(' ') || req.emp_no || '—';
    };

    const getDesignationName = (req: ResignationRequest) => {
        const des = req.employeeId?.designation_id || req.employeeId?.designation;
        if (typeof des === 'object' && des?.name) return des.name;
        return '—';
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        const d = dayjs(dateStr);
        if (!d.isValid()) return '—';
        return d.format('DD MMM YYYY');
    };

    const getLatestApprovedStep = (req: ResignationRequest) => {
        return (req.workflow?.approvalChain || [])
            .filter((step) => (step.status || '').toLowerCase() === 'approved')
            .sort((a, b) => {
                const aTime = new Date(a.updatedAt || '').getTime() || 0;
                const bTime = new Date(b.updatedAt || '').getTime() || 0;
                return bTime - aTime;
            })[0];
    };

    const getFormattedApprovalDate = (req: ResignationRequest): string => {
        const step = getLatestApprovedStep(req);
        if (!step?.updatedAt) return '—';
        return formatDate(step.updatedAt);
    };

    const getDisplayStatusText = (req?: ResignationRequest | null) => {
        if (!req) return '—';
        const baseStatus = (req.status || 'pending').toLowerCase();
        if (baseStatus === 'rejected' || baseStatus === 'cancelled') return 'Rejected';
        if (baseStatus === 'approved' || req.workflow?.isCompleted) return 'Approved';
        
        const approvedSteps = (req.workflow?.approvalChain || []).filter(
            (step) => (step.status || '').toLowerCase() === 'approved'
        );
        if (approvedSteps.length > 0) {
            const latestStep = approvedSteps[approvedSteps.length - 1];
            const roleLabel = latestStep.label || latestStep.role || '';
            const cleanRole = roleLabel.replace(/_/g, ' ').replace(/\s*approval\s*$/i, '').trim();
            return cleanRole ? `${cleanRole.charAt(0).toUpperCase() + cleanRole.slice(1)} Approved` : 'Approved';
        }
        return 'Pending';
    };

    const getWorkflowStageLabel = (req: ResignationRequest | undefined, index: number): string => {
        const step = req?.workflow?.approvalChain?.[index];
        if (!step) return `Stage ${index + 1}`;
        const label = step.label || step.role || '';
        const clean = String(label).replace(/_/g, ' ').replace(/\s*approval\s*$/i, '').trim();
        return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : `Stage ${index + 1}`;
    };

    const getStageContent = (req: ResignationRequest, index: number): string => {
        const step = req.workflow?.approvalChain?.[index];
        if (!step) return 'N/A';
        const status = (step.status || '').toLowerCase();
        if (!status || status === 'pending') return 'Pending';
        if (status === 'rejected') return 'Rejected';
        
        const userName = step.actionByName || step.actionByRole || '';
        const dateStr = step.updatedAt ? formatDate(step.updatedAt) : '';
        
        if (userName && dateStr) return `Approved (${dateStr})`;
        if (dateStr) return `Approved (${dateStr})`;
        return 'Approved';
    };

    const getNocStatus = () => 'N/A';

    const getSelectedFiltersSummary = (): string => {
        const parts: string[] = [];
        
        if (divisionIds.length > 0) {
            const names = divisions.filter(d => divisionIds.includes(d._id)).map(d => d.name);
            parts.push(`Division: ${names.join(', ') || 'Selected'}`);
        } else {
            parts.push('Division: All');
        }

        if (departmentIds.length > 0) {
            const names = departments.filter(d => departmentIds.includes(d._id)).map(d => d.name);
            parts.push(`Department: ${names.join(', ') || 'Selected'}`);
        } else {
            parts.push('Department: All');
        }

        if (designationIds.length > 0) {
            const names = designations.filter(d => designationIds.includes(d._id)).map(d => d.name);
            parts.push(`Designation: ${names.join(', ') || 'Selected'}`);
        } else {
            parts.push('Designation: All');
        }

        if (groupFilterIds.length > 0) {
            const names = groups.filter(g => groupFilterIds.includes(g._id)).map(g => g.name);
            parts.push(`Group: ${names.join(', ') || 'Selected'}`);
        } else {
            parts.push('Group: All');
        }

        if (employeeIds.length > 0) {
            parts.push(`Employee: ${employeeIds.length} selected`);
        }

        const targetLabel = dateFilterTarget === 'createdAt' ? 'Date Applied' : 'Last Working Date';
        const formattedStart = formatDate(effectiveDates.start);
        const formattedEnd = formatDate(effectiveDates.end);
        parts.push(`Period (${targetLabel}): ${formattedStart} to ${formattedEnd}`);

        if (requestTypeFilter && requestTypeFilter !== 'all') {
            parts.push(`Request Type: ${requestTypeFilter.charAt(0).toUpperCase() + requestTypeFilter.slice(1)}`);
        }

        if (statusFilter) {
            parts.push(`Status: ${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}`);
        } else {
            parts.push('Status: All');
        }

        if (searchQuery.trim()) {
            parts.push(`Search: "${searchQuery.trim()}"`);
        }

        return `Selected Filters: ${parts.join(' | ')}`;
    };

    // Excel Export
    const handleExportXLSX = () => {
        if (baseFilteredRequests.length === 0) {
            toast.error('No resignation records to export.');
            return;
        }
        setLoadingExportExcel(true);
        try {
            const sampleReq = baseFilteredRequests.find(r => r.workflow?.approvalChain?.length);
            const stage1Label = getWorkflowStageLabel(sampleReq, 0);
            const stage2Label = getWorkflowStageLabel(sampleReq, 1);
            const stage3Label = getWorkflowStageLabel(sampleReq, 2);
            const filterSummary = getSelectedFiltersSummary();

            const aoa: any[][] = [
                ['REPORT ON RESIGNATIONS'],
                [filterSummary],
                [],
                [
                    'S.No',
                    'EC No.',
                    'Name of the Employee',
                    'Designation',
                    'Division',
                    'Department',
                    'Group',
                    'Date of Applied',
                    'Date of approved', '', '',
                    'Last Working Date',
                    'Status',
                    'NOC Completed (Y/N)',
                    'Remarks'
                ],
                [
                    '', '', '', '', '', '', '', '',
                    stage1Label,
                    stage2Label,
                    stage3Label,
                    '', '', '', ''
                ]
            ];

            baseFilteredRequests.forEach((req, index) => {
                aoa.push([
                    index + 1,
                    req.emp_no || '—',
                    getEmployeeName(req),
                    getDesignationName(req),
                    req.employeeId?.division_id?.name || '—',
                    req.employeeId?.department_id?.name || '—',
                    req.employeeId?.employee_group_id?.name || '—',
                    formatDate(req.createdAt),
                    getStageContent(req, 0),
                    getStageContent(req, 1),
                    getStageContent(req, 2),
                    formatDate(req.leftDate),
                    getDisplayStatusText(req),
                    getNocStatus(),
                    req.remarks || '—',
                ]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(aoa);

            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
                { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
                { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
                { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } },
                { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } },
                { s: { r: 3, c: 4 }, e: { r: 4, c: 4 } },
                { s: { r: 3, c: 5 }, e: { r: 4, c: 5 } },
                { s: { r: 3, c: 6 }, e: { r: 4, c: 6 } },
                { s: { r: 3, c: 7 }, e: { r: 4, c: 7 } },
                { s: { r: 3, c: 8 }, e: { r: 3, c: 10 } },
                { s: { r: 3, c: 11 }, e: { r: 4, c: 11 } },
                { s: { r: 3, c: 12 }, e: { r: 4, c: 12 } },
                { s: { r: 3, c: 13 }, e: { r: 4, c: 13 } },
                { s: { r: 3, c: 14 }, e: { r: 4, c: 14 } },
            ];

            ws['!cols'] = [
                { wch: 8 },  // S.No
                { wch: 14 }, // EC No.
                { wch: 25 }, // Name of Employee
                { wch: 22 }, // Designation
                { wch: 20 }, // Division
                { wch: 20 }, // Department
                { wch: 18 }, // Group
                { wch: 16 }, // Date of Applied
                { wch: 22 }, // Stage 1
                { wch: 22 }, // Stage 2
                { wch: 22 }, // Stage 3
                { wch: 18 }, // Last Working Date
                { wch: 16 }, // Status
                { wch: 18 }, // NOC Completed
                { wch: 30 }, // Remarks
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Resignations');
            XLSX.writeFile(wb, `Resignations_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            toast.success('Excel downloaded successfully!');
        } catch (error) {
            console.error('Excel export error:', error);
            toast.error('Failed to export Excel.');
        } finally {
            setLoadingExportExcel(false);
        }
    };

    // PDF Grouping Helper
    const groupRequestsByDivisionDepartment = (requests: ResignationRequest[]) => {
        const grouped: Record<string, Record<string, ResignationRequest[]>> = {};
        requests.forEach((req) => {
            const division = req.employeeId?.division_id?.name || 'Unknown Division';
            const department = req.employeeId?.department_id?.name || 'Unknown Department';
            
            if (!grouped[division]) {
                grouped[division] = {};
            }
            if (!grouped[division][department]) {
                grouped[division][department] = [];
            }
            grouped[division][department].push(req);
        });
        return grouped;
    };

    // PDF Export
    const handleExportPDF = () => {
        if (baseFilteredRequests.length === 0) {
            toast.error('No resignation records to export.');
            return;
        }
        setLoadingExportPdf(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            let currentY = 12;
            let isFirstPage = true;

            const sampleReq = baseFilteredRequests.find(r => r.workflow?.approvalChain?.length);
            const stage1Label = getWorkflowStageLabel(sampleReq, 0);
            const stage2Label = getWorkflowStageLabel(sampleReq, 1);
            const stage3Label = getWorkflowStageLabel(sampleReq, 2);
            const filterSummary = getSelectedFiltersSummary();

            const grouped = groupRequestsByDivisionDepartment(baseFilteredRequests);

            Object.keys(grouped).sort().forEach((division) => {
                Object.keys(grouped[division]).sort().forEach((department) => {
                    const divisionalRequests = grouped[division][department];

                    if (!isFirstPage) {
                        doc.addPage();
                        currentY = 12;
                    }

                    // Top Banner / Title & Parameters Subtitle
                    doc.setFillColor(15, 23, 42); // slate-900
                    doc.rect(10, currentY, pageWidth - 20, 24, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(13);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`REPORT ON RESIGNATIONS — ${division} / ${department}`, 14, currentY + 8);
                    doc.setFontSize(7.5);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`${filterSummary}  |  Total Records: ${divisionalRequests.length}`, 14, currentY + 16);
                    currentY += 28;

                    const body = divisionalRequests.map((req, index) => [
                        (index + 1).toString(),
                        req.emp_no || '—',
                        getEmployeeName(req),
                        getDesignationName(req),
                        req.employeeId?.division_id?.name || '—',
                        req.employeeId?.department_id?.name || '—',
                        req.employeeId?.employee_group_id?.name || '—',
                        formatDate(req.createdAt),
                        getStageContent(req, 0),
                        getStageContent(req, 1),
                        getStageContent(req, 2),
                        formatDate(req.leftDate),
                        getDisplayStatusText(req),
                        getNocStatus(),
                        req.remarks || '—',
                    ]);

                    autoTable(doc, {
                        startY: currentY,
                        head: [
                            [
                                { content: 'S.No', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'EC No.', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'Name of the Employee', rowSpan: 2, styles: { valign: 'middle' } },
                                { content: 'Designation', rowSpan: 2, styles: { valign: 'middle' } },
                                { content: 'Division', rowSpan: 2, styles: { valign: 'middle' } },
                                { content: 'Department', rowSpan: 2, styles: { valign: 'middle' } },
                                { content: 'Group', rowSpan: 2, styles: { valign: 'middle' } },
                                { content: 'Date of Applied', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'Date of approved', colSpan: 3, styles: { halign: 'center' } },
                                { content: 'Last Working Date', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'Status', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'NOC Completed', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
                                { content: 'Remarks', rowSpan: 2, styles: { valign: 'middle' } },
                            ],
                            [
                                { content: stage1Label, styles: { halign: 'center' } },
                                { content: stage2Label, styles: { halign: 'center' } },
                                { content: stage3Label, styles: { halign: 'center' } },
                            ]
                        ],
                        body,
                        theme: 'grid',
                        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
                        styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak' },
                        margin: { left: 10, right: 10 },
                        columnStyles: {
                            0: { cellWidth: 10 },  // S.No
                            1: { cellWidth: 16 },  // EC No.
                            2: { cellWidth: 28 },  // Employee Name
                            3: { cellWidth: 22 },  // Designation
                            4: { cellWidth: 20 },  // Division
                            5: { cellWidth: 20 },  // Department
                            6: { cellWidth: 18 },  // Group
                            7: { cellWidth: 18 },  // Applied Date
                            8: { cellWidth: 22 },  // Stage 1
                            9: { cellWidth: 22 },  // Stage 2
                            10: { cellWidth: 22 }, // Stage 3
                            11: { cellWidth: 18 }, // LWD
                            12: { cellWidth: 16 }, // Status
                            13: { cellWidth: 16 }, // NOC Completed
                            14: { cellWidth: 29 }, // Remarks
                        },
                        didDrawPage: (data) => {
                            currentY = data.cursor?.y || currentY;
                        },
                    });

                    currentY = (doc as any).lastAutoTable?.finalY || currentY + 10;
                    isFirstPage = false;
                });
            });

            doc.save(`Resignations_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
            toast.success('PDF downloaded successfully!');
        } catch (error) {
            console.error('PDF export error:', error);
            toast.error('Failed to export PDF.');
        } finally {
            setLoadingExportPdf(false);
        }
    };

    return (
        <div className="space-y-6 w-full pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
                <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Resignation Applications Report</h3>
                    <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        Generate and export structured reports for employee resignation and termination requests with all detailed columns.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={handleExportPDF}
                        disabled={loadingExportPdf || loadingExportExcel || loadingData}
                        className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700 shadow-sm"
                    >
                        {loadingExportPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {loadingExportPdf ? 'Generating PDF...' : 'Export PDF'}
                    </button>

                    <button
                        onClick={handleExportXLSX}
                        disabled={loadingExportPdf || loadingExportExcel || loadingData}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                        {loadingExportExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {loadingExportExcel ? 'Generating Excel...' : 'Export Excel'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10">
                {/* Hierarchy Filters */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <Filter className="h-3.5 w-3.5" />
                        Hierarchy & Group Filters
                    </h4>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 p-5 grid gap-4 grid-cols-1 sm:grid-cols-2">
                        <MultiSelect
                            label="Division"
                            options={divisions.map(d => ({ id: d._id, name: d.name }))}
                            selectedIds={divisionIds}
                            onChange={handleDivisionChange}
                            loading={fetchingFilters}
                        />
                        <MultiSelect
                            label="Department"
                            options={departments.map(d => ({ id: d._id, name: d.name }))}
                            selectedIds={departmentIds}
                            onChange={handleDepartmentChange}
                            disabled={divisionIds.length === 0}
                        />
                        <MultiSelect
                            label="Designation"
                            options={designations.map(d => ({ id: d._id, name: d.name }))}
                            selectedIds={designationIds}
                            onChange={designationIds => setDesignationIds(designationIds)}
                            loading={fetchingFilters}
                        />
                        <MultiSelect
                            label="Employee Group"
                            options={groups.map(g => ({ id: g._id, name: g.name }))}
                            selectedIds={groupFilterIds}
                            onChange={ids => setGroupFilterIds(ids)}
                            loading={fetchingFilters}
                        />
                        <div className="sm:col-span-2">
                            <MultiSelect
                                label="Employee"
                                options={employees.map(e => ({ id: e._id, name: `${e.employee_name} (${e.emp_no})` }))}
                                selectedIds={employeeIds}
                                onChange={employeeIds => setEmployeeIds(employeeIds)}
                                disabled={departmentIds.length === 0}
                            />
                        </div>
                    </div>
                </div>

                {/* Period & Search */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between ml-1">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Period & Type Filters
                        </h4>
                        
                        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                            <button
                                onClick={() => setDateMode('pay_cycle')}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'pay_cycle' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Pay Cycle
                            </button>
                            <button
                                onClick={() => setDateMode('monthly')}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setDateMode('range')}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${dateMode === 'range' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Range
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 p-5 flex flex-col gap-4">
                        {/* Target Date Toggle */}
                        <div className="flex items-center justify-between gap-4 p-2 bg-slate-50/50 dark:bg-slate-800/10 rounded-xl border border-slate-100/50 dark:border-slate-800/20">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Period Filters Target</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDateFilterTarget('createdAt')}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${dateFilterTarget === 'createdAt' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-sm' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}
                                >
                                    Date Applied
                                </button>
                                <button
                                    onClick={() => setDateFilterTarget('leftDate')}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${dateFilterTarget === 'leftDate' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100 shadow-sm' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}
                                >
                                    Last Working Date
                                </button>
                            </div>
                        </div>

                        {(dateMode === 'monthly' || dateMode === 'pay_cycle') && (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Month</label>
                                        <select
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-slate-500/20 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                        >
                                            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                                                <option key={i} value={(i + 1).toString()}>{m}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Year</label>
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-slate-500/20 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                        >
                                            {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                                                <option key={y} value={y.toString()}>{y}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 p-3 bg-slate-50/50 dark:bg-slate-800/10 rounded-xl border border-slate-100/50 dark:border-slate-800/20">
                                    <Clock className="h-3.5 w-3.5 text-slate-550 dark:text-slate-400 mt-0.5" />
                                    <p className="text-[10px] font-bold text-slate-500 leading-normal">
                                        {dateMode === 'pay_cycle' 
                                            ? `Payroll logic applied: Cycle from ${payrollStartDay} of previous month to ${payrollStartDay - 1} of current month.`
                                            : 'Monthly logic applied: Data shown from 1st to last day of selected month.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {dateMode === 'range' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">From Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">To Date</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Request Type</label>
                                <select
                                    value={requestTypeFilter}
                                    onChange={(e) => setRequestTypeFilter(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-slate-500/20 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                >
                                    <option value="all">All Types</option>
                                    <option value="resignation">Resignation</option>
                                    <option value="termination">Termination</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Status Filter</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-slate-500/20 outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Quick Search</label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search name or ID..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-500/20 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 relative z-0">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Total Resignations</span>
                        <FileText className="h-4 w-4 text-slate-400" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{reportStats.total}</p>
                    <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-tight">Total records in period</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Approved</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-black text-emerald-600 tracking-tighter">{reportStats.approved}</p>
                    <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-tight">Finalized & closed</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Pending</span>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <p className="text-2xl font-black text-amber-600 tracking-tighter">{reportStats.pending}</p>
                    <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-tight">Awaiting approval</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 dark:bg-slate-900 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-550 uppercase tracking-widest">Rejected</span>
                        <XCircle className="h-4 w-4 text-rose-500" />
                    </div>
                    <p className="text-2xl font-black text-rose-600 tracking-tighter">{reportStats.rejected}</p>
                    <p className="mt-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-tight">Rejected requests</p>
                </div>
            </div>

            {/* Data Preview Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Search className="h-3.5 w-3.5 text-slate-400" />
                            Data Preview
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">
                            Showing {paginatedRequests.length} records out of {baseFilteredRequests.length} matching filter criteria
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={currentPage === 1 || loadingData}
                            onClick={() => setCurrentPage(p => p - 1)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 dark:border-slate-700 transition-all dark:hover:bg-slate-800"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 px-2 uppercase tracking-widest">
                            Page {currentPage} of {Math.max(1, Math.ceil(baseFilteredRequests.length / limit))}
                        </span>
                        <button
                            disabled={currentPage * limit >= baseFilteredRequests.length || loadingData}
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-30 dark:border-slate-700 transition-all dark:hover:bg-slate-800"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px] relative">
                    {loadingData && (
                        <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                        </div>
                    )}
                    
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Employee</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Division/Dept</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Designation/Group</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date Applied</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Working Date</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {paginatedRequests.length > 0 ? paginatedRequests.map((req) => (
                                <tr key={req._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                    <td className="px-5 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-900 dark:text-white capitalize leading-tight">
                                                {getEmployeeName(req)}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 mt-0.5 tracking-wider uppercase">
                                                {req.emp_no || '—'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                {req.employeeId?.division_id?.name || '—'}
                                            </span>
                                            <span className="text-[9px] font-medium text-slate-400 mt-0.5 uppercase">
                                                {req.employeeId?.department_id?.name || '—'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                                {getDesignationName(req)}
                                            </span>
                                            <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                                                {req.employeeId?.employee_group_id?.name || '—'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        {req.requestType === 'termination' ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-rose-50 text-rose-600 dark:bg-rose-950/30">
                                                Termination
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 dark:bg-blue-950/30">
                                                Resignation
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        {formatDate(req.createdAt)}
                                    </td>
                                    <td className="px-5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        {formatDate(req.leftDate)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            req.status === 'approved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' :
                                            ['rejected', 'cancelled'].includes(req.status) ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' :
                                            'bg-amber-50 text-amber-600 dark:bg-amber-950/30'
                                        }`}>
                                            {getDisplayStatusText(req)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={req.remarks}>
                                        {req.remarks || '—'}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={8} className="px-5 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center dark:bg-slate-800/50">
                                                <AlertCircle className="h-6 w-6 text-slate-300" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No Records Found</p>
                                                <p className="text-[10px] text-slate-400/60 mt-1 font-medium italic">Adjust filters to see preview data</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
