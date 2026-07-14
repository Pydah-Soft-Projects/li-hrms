'use client';

import { useState, useEffect, useMemo } from 'react';
import { api, Division, Department, Employee, Designation } from '@/lib/api';
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
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    
    // Selection states
    const [divisionIds, setDivisionIds] = useState<string[]>([]);
    const [departmentIds, setDepartmentIds] = useState<string[]>([]);
    const [designationIds, setDesignationIds] = useState<string[]>([]);
    const [employeeIds, setEmployeeIds] = useState<string[]>([]);
    
    // Date/Mode states
    const [dateMode, setDateMode] = useState<'pay_cycle' | 'monthly' | 'range'>('pay_cycle');
    const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
    const [payrollStartDay, setPayrollStartDay] = useState<number>(1);
    const [searchQuery, setSearchQuery] = useState('');

    // Specific extra date filters
    const [dateFilterTarget, setDateFilterTarget] = useState<'createdAt' | 'leftDate'>('createdAt');
    const [lwdFrom, setLwdFrom] = useState('');
    const [lwdTo, setLwdTo] = useState('');
    const [appliedFrom, setAppliedFrom] = useState('');
    const [appliedTo, setAppliedTo] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Report data states
    const [allRequests, setAllRequests] = useState<ResignationRequest[]>([]);
    
    // Pagination states for different tables
    const [pageSingle, setPageSingle] = useState(1);
    const [pageApplied, setPageApplied] = useState(1);
    const [pageLwd, setPageLwd] = useState(1);
    const limit = 10;

    useEffect(() => {
        loadInitialFilters();
        fetchReportData();
    }, []);

    const loadInitialFilters = async () => {
        setFetchingFilters(true);
        try {
            const [divRes, desRes, settingRes] = await Promise.all([
                api.getDivisions(true),
                api.getAllDesignations(),
                api.getSetting('payroll_cycle_start_day'),
            ]);
            if (divRes.success) setDivisions(divRes.data || []);
            if (desRes.success) setDesignations(desRes.data || []);
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

    // Check if both additional date filters are set
    const isBothFiltersSet = useMemo(() => {
        return !!((appliedFrom || appliedTo) && (lwdFrom || lwdTo));
    }, [appliedFrom, appliedTo, lwdFrom, lwdTo]);

    // Base client-side filtering (excluding additional LWD & Applied ranges)
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

            // Employee Filter
            if (employeeIds.length > 0) {
                const empId = req.employeeId?._id;
                if (!empId || !employeeIds.includes(empId)) return false;
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
    }, [allRequests, searchQuery, divisionIds, departmentIds, designationIds, employeeIds, statusFilter, dateFilterTarget, effectiveDates]);

    // Sub-array filtered by Date Applied only
    const appliedFilteredRequests = useMemo(() => {
        return baseFilteredRequests.filter((req) => {
            if (appliedFrom) {
                const target = dayjs(req.createdAt).startOf('day');
                const from = dayjs(appliedFrom).startOf('day');
                if (target.isBefore(from)) return false;
            }
            if (appliedTo) {
                const target = dayjs(req.createdAt).endOf('day');
                const to = dayjs(appliedTo).endOf('day');
                if (target.isAfter(to)) return false;
            }
            return true;
        });
    }, [baseFilteredRequests, appliedFrom, appliedTo]);

    // Sub-array filtered by LWD only
    const lwdFilteredRequests = useMemo(() => {
        return baseFilteredRequests.filter((req) => {
            if (lwdFrom) {
                if (!req.leftDate) return false;
                const target = dayjs(req.leftDate).startOf('day');
                const from = dayjs(lwdFrom).startOf('day');
                if (target.isBefore(from)) return false;
            }
            if (lwdTo) {
                if (!req.leftDate) return false;
                const target = dayjs(req.leftDate).endOf('day');
                const to = dayjs(lwdTo).endOf('day');
                if (target.isAfter(to)) return false;
            }
            return true;
        });
    }, [baseFilteredRequests, lwdFrom, lwdTo]);

    // Combined cumulative filters for the single table view
    const singleFilteredRequests = useMemo(() => {
        return baseFilteredRequests.filter((req) => {
            if (appliedFrom) {
                const target = dayjs(req.createdAt).startOf('day');
                const from = dayjs(appliedFrom).startOf('day');
                if (target.isBefore(from)) return false;
            }
            if (appliedTo) {
                const target = dayjs(req.createdAt).endOf('day');
                const to = dayjs(appliedTo).endOf('day');
                if (target.isAfter(to)) return false;
            }
            if (lwdFrom) {
                if (!req.leftDate) return false;
                const target = dayjs(req.leftDate).startOf('day');
                const from = dayjs(lwdFrom).startOf('day');
                if (target.isBefore(from)) return false;
            }
            if (lwdTo) {
                if (!req.leftDate) return false;
                const target = dayjs(req.leftDate).endOf('day');
                const to = dayjs(lwdTo).endOf('day');
                if (target.isAfter(to)) return false;
            }
            return true;
        });
    }, [baseFilteredRequests, appliedFrom, appliedTo, lwdFrom, lwdTo]);

    // Union list of unique records across both tables when both filters are set
    const unionRequests = useMemo(() => {
        const map = new Map<string, ResignationRequest>();
        appliedFilteredRequests.forEach(r => map.set(r._id, r));
        lwdFilteredRequests.forEach(r => map.set(r._id, r));
        return Array.from(map.values());
    }, [appliedFilteredRequests, lwdFilteredRequests]);

    // Stats calculations based on current active list
    const reportStats = useMemo(() => {
        const activeList = isBothFiltersSet ? unionRequests : singleFilteredRequests;
        const total = activeList.length;
        const approved = activeList.filter(r => r.status === 'approved').length;
        const pending = activeList.filter(r => r.status === 'pending').length;
        const rejected = activeList.filter(r => ['rejected', 'cancelled'].includes(r.status)).length;
        return { total, approved, pending, rejected };
    }, [isBothFiltersSet, unionRequests, singleFilteredRequests]);

    // Paginated subsets
    const paginatedSingleRequests = useMemo(() => {
        const start = (pageSingle - 1) * limit;
        return singleFilteredRequests.slice(start, start + limit);
    }, [singleFilteredRequests, pageSingle]);

    const paginatedAppliedRequests = useMemo(() => {
        const start = (pageApplied - 1) * limit;
        return appliedFilteredRequests.slice(start, start + limit);
    }, [appliedFilteredRequests, pageApplied]);

    const paginatedLwdRequests = useMemo(() => {
        const start = (pageLwd - 1) * limit;
        return lwdFilteredRequests.slice(start, start + limit);
    }, [lwdFilteredRequests, pageLwd]);

    // Reset pagination pages on filter changes
    useEffect(() => {
        setPageSingle(1);
        setPageApplied(1);
        setPageLwd(1);
    }, [searchQuery, divisionIds, departmentIds, designationIds, employeeIds, statusFilter, dateFilterTarget, effectiveDates, appliedFrom, appliedTo, lwdFrom, lwdTo]);

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
        return dayjs(dateStr).format('DD MMM YYYY');
    };

    const getDisplayStatus = (status: string) => {
        switch (status) {
            case 'approved':
                return 'Approved';
            case 'pending':
                return 'Pending';
            case 'rejected':
            case 'cancelled':
                return 'Rejected';
            default:
                return status;
        }
    };

    // Excel Export
    const handleExportXLSX = () => {
        const activeList = isBothFiltersSet ? unionRequests : singleFilteredRequests;
        if (activeList.length === 0) {
            toast.error('No resignation records to export.');
            return;
        }
        setLoadingExportExcel(true);
        try {
            const wb = XLSX.utils.book_new();

            if (isBothFiltersSet) {
                // Sheet 1: Filtered by Date Applied
                const rowsApplied = appliedFilteredRequests.map(req => ({
                    'Employee Code': req.emp_no || '—',
                    'Employee Name': getEmployeeName(req),
                    'Division': req.employeeId?.division_id?.name || '—',
                    'Department': req.employeeId?.department_id?.name || '—',
                    'Designation': getDesignationName(req),
                    'Date Applied': formatDate(req.createdAt),
                    'Last Working Date (LWD)': formatDate(req.leftDate),
                    'Status': getDisplayStatus(req.status),
                    'Remarks': req.remarks || '—'
                }));
                const wsApplied = XLSX.utils.json_to_sheet(rowsApplied);
                wsApplied['!cols'] = [
                    { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 30 }
                ];
                XLSX.utils.book_append_sheet(wb, wsApplied, 'By Date Applied');

                // Sheet 2: Filtered by LWD
                const rowsLwd = lwdFilteredRequests.map(req => ({
                    'Employee Code': req.emp_no || '—',
                    'Employee Name': getEmployeeName(req),
                    'Division': req.employeeId?.division_id?.name || '—',
                    'Department': req.employeeId?.department_id?.name || '—',
                    'Designation': getDesignationName(req),
                    'Date Applied': formatDate(req.createdAt),
                    'Last Working Date (LWD)': formatDate(req.leftDate),
                    'Status': getDisplayStatus(req.status),
                    'Remarks': req.remarks || '—'
                }));
                const wsLwd = XLSX.utils.json_to_sheet(rowsLwd);
                wsLwd['!cols'] = [
                    { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 30 }
                ];
                XLSX.utils.book_append_sheet(wb, wsLwd, 'By Last Working Date');
                
                XLSX.writeFile(wb, `Resignations_Double_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            } else {
                const rows = singleFilteredRequests.map(req => ({
                    'Employee Code': req.emp_no || '—',
                    'Employee Name': getEmployeeName(req),
                    'Division': req.employeeId?.division_id?.name || '—',
                    'Department': req.employeeId?.department_id?.name || '—',
                    'Designation': getDesignationName(req),
                    'Date Applied': formatDate(req.createdAt),
                    'Last Working Date (LWD)': formatDate(req.leftDate),
                    'Status': getDisplayStatus(req.status),
                    'Remarks': req.remarks || '—'
                }));
                const ws = XLSX.utils.json_to_sheet(rows);
                ws['!cols'] = [
                    { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 30 }
                ];
                XLSX.utils.book_append_sheet(wb, ws, 'Resignations');
                XLSX.writeFile(wb, `Resignations_Report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            }
            
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
        const activeList = isBothFiltersSet ? unionRequests : singleFilteredRequests;
        if (activeList.length === 0) {
            toast.error('No resignation records to export.');
            return;
        }
        setLoadingExportPdf(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            let currentY = 10;

            const generateSection = (requests: ResignationRequest[], sectionTitle: string) => {
                let isFirstSection = true;
                const grouped = groupRequestsByDivisionDepartment(requests);

                Object.keys(grouped).sort().forEach((division) => {
                    Object.keys(grouped[division]).sort().forEach((department) => {
                        const divisionalRequests = grouped[division][department];

                        if (!isFirstSection || currentY > 10) {
                            doc.addPage();
                            currentY = 10;
                        }

                        // Header banner
                        doc.setFillColor(15, 23, 42); // slate-900
                        doc.rect(14, currentY, pageWidth - 28, 25, 'F');
                        doc.setTextColor(255, 255, 255);
                        doc.setFontSize(13);
                        doc.setFont('helvetica', 'bold');
                        doc.text(`${sectionTitle} - ${division} / ${department}`, 18, currentY + 9);
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 18, currentY + 17);
                        currentY += 28;

                        const body = divisionalRequests.map((req) => [
                            req.emp_no || '—',
                            getEmployeeName(req),
                            getDesignationName(req),
                            req.employeeId?.employee_group_id?.name || '—',
                            formatDate(req.createdAt),
                            formatDate(req.leftDate),
                            getDisplayStatus(req.status),
                            req.remarks || '—',
                        ]);

                        autoTable(doc, {
                            startY: currentY,
                            head: [[
                                'Emp No',
                                'Employee Name',
                                'Designation',
                                'Group',
                                'Date Applied',
                                'Last Working Date (LWD)',
                                'Status',
                                'Remarks'
                            ]],
                            body,
                            theme: 'grid',
                            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
                            styles: { fontSize: 7.5, cellPadding: 2.5 },
                            margin: { left: 14, right: 14 },
                            columnStyles: {
                                0: { cellWidth: 20 },
                                1: { cellWidth: 35 },
                                2: { cellWidth: 30 },
                                3: { cellWidth: 22 },
                                4: { cellWidth: 25 },
                                5: { cellWidth: 35 },
                                6: { cellWidth: 20 },
                                7: { cellWidth: 80 },
                            },
                            didDrawPage: (data) => {
                                currentY = data.cursor?.y || currentY;
                            },
                        });

                        currentY = (doc as any).lastAutoTable?.finalY || currentY + 10;
                        isFirstSection = false;
                    });
                });
            };

            if (isBothFiltersSet) {
                generateSection(appliedFilteredRequests, 'Resignation Report (By Date Applied)');
                generateSection(lwdFilteredRequests, 'Resignation Report (By Last Working Date)');
            } else {
                generateSection(singleFilteredRequests, 'Resignation Report');
            }

            doc.save(`Resignations_Report_${dayjs().format('YYYY-MM-DD')}.pdf`);
            toast.success('PDF downloaded successfully!');
        } catch (error) {
            console.error('PDF export error:', error);
            toast.error('Failed to export PDF.');
        } finally {
            setLoadingExportPdf(false);
        }
    };

    const renderTable = (
        title: string, 
        subtitle: string, 
        requests: ResignationRequest[], 
        paginated: ResignationRequest[], 
        currentPage: number, 
        setCurrentPage: React.Dispatch<React.SetStateAction<number>>
    ) => {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <Search className="h-3.5 w-3.5 text-slate-400" />
                            {title}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">
                            {subtitle} (Showing {paginated.length} records out of {requests.length})
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
                            Page {currentPage} of {Math.max(1, Math.ceil(requests.length / limit))}
                        </span>
                        <button
                            disabled={currentPage * limit >= requests.length || loadingData}
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
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Designation</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date Applied</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Working Date</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {paginated.length > 0 ? paginated.map((req) => (
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
                                    <td className="px-5 py-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                                        {getDesignationName(req)}
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
                                            {getDisplayStatus(req.status)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={req.remarks}>
                                        {req.remarks || '—'}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-5 py-20 text-center">
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
        );
    };

    return (
        <div className="space-y-6 w-full pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
                <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Resignation Applications Report</h3>
                    <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        Generate and export structured reports for employee resignation and termination requests.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleExportPDF}
                        disabled={loadingExportPdf || loadingExportExcel || loadingData}
                        className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                        {loadingExportPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {loadingExportPdf ? 'Generating...' : 'Export PDF'}
                    </button>

                    <button
                        onClick={handleExportXLSX}
                        disabled={loadingExportPdf || loadingExportExcel || loadingData}
                        className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                    >
                        {loadingExportExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {loadingExportExcel ? 'Generating...' : 'Export XLSX'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10">
                {/* Hierarchy Filters */}
                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        <Filter className="h-3.5 w-3.5" />
                        Hierarchy Filters
                    </h4>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 p-5 grid gap-4 grid-cols-2">
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
                            label="Employee"
                            options={employees.map(e => ({ id: e._id, name: `${e.employee_name} (${e.emp_no})` }))}
                            selectedIds={employeeIds}
                            onChange={employeeIds => setEmployeeIds(employeeIds)}
                            disabled={departmentIds.length === 0}
                        />
                    </div>
                </div>

                {/* Period & Search */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between ml-1">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Period & Search
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

                        <div className="grid grid-cols-2 gap-4">
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

            {/* Data Tables */}
            {isBothFiltersSet ? (
                <div className="space-y-6">
                    {renderTable("Data Preview: Filtered by Date Applied", "Resignations applied within date applied range", appliedFilteredRequests, paginatedAppliedRequests, pageApplied, setPageApplied)}
                    {renderTable("Data Preview: Filtered by Last Working Date (LWD)", "Resignations with last working date within LWD range", lwdFilteredRequests, paginatedLwdRequests, pageLwd, setPageLwd)}
                </div>
            ) : (
                renderTable("Data Preview", "All resignation records matching filter criteria", singleFilteredRequests, paginatedSingleRequests, pageSingle, setPageSingle)
            )}
        </div>
    );
}
