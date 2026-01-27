'use client';

import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department_id?: string | { _id: string; name: string };
  designation_id?: string | { _id: string; name: string };
  location?: string;
  bank_account_no?: string;
  pf_number?: string;
  esi_number?: string;
}

interface Department {
  _id: string;
  name: string;
}

interface Designation {
  _id: string;
  name: string;
}

interface PayrollRecord {
  _id: string;
  employeeId: Employee | string;
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  monthNumber: number;
  attendance?: {
    totalDaysInMonth: number;
    presentDays: number;
    paidLeaveDays: number;
    odDays: number;
    weeklyOffs: number;
    holidays: number;
    absentDays: number;
    payableShifts: number;
    extraDays: number;
    totalPaidDays: number;
    otHours: number;
    otDays: number;
    earnedSalary: number;
  };
  earnings: {
    basicPay: number;
    perDayBasicPay: number;
    payableAmount: number;
    incentive: number;
    otPay: number;
    otHours: number;
    totalAllowances: number;
    allowances: Array<{ name: string; amount: number }>;
    grossSalary: number;
  };
  deductions: {
    attendanceDeduction: number;
    permissionDeduction: number;
    leaveDeduction: number;
    totalOtherDeductions: number;
    otherDeductions: Array<{ name: string; amount: number }>;
    totalDeductions: number;
  };
  loanAdvance: {
    totalEMI: number;
    advanceDeduction: number;
  };
  netSalary: number;
  status: string;
  arrearsAmount?: number;
  totalDaysInMonth?: number;
  totalPayableShifts?: number;
  roundOff?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Renders the Employee Payslips management page with listing, filtering, pagination, and PDF export.
 *
 * Provides controls to select month/department/designation/employee/status, search by employee ID or name,
 * view individual payslips, download single payslip PDFs, and export selected payslips as a bulk PDF.
 * The component also fetches and caches departments, designations, employees, and payroll records as needed.
 *
 * @returns The React element for the payslips management page.
 */
export default function PayslipsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<PayrollRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // PDF Generation
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingBulkPDF, setGeneratingBulkPDF] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;

  useEffect(() => {
    const today = new Date();
    const day = today.getDate();
    let defaultMonth = '';
    if (day > 15) {
      // Current month (YYYY-MM)
      defaultMonth = today.toISOString().substring(0, 7);
    } else {
      // Previous month
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      defaultMonth = prevMonth.toISOString().substring(0, 7);
    }
    setSelectedMonth(defaultMonth);

    fetchDepartments();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchPayrollRecords();
      if (selectedDepartment) {
        fetchDesignations(selectedDepartment);
      } else {
        setDesignations([]);
        setSelectedDesignation('');
      }
    }
  }, [selectedMonth, selectedDepartment]);

  useEffect(() => {
    applyFilters();
  }, [payrollRecords, searchQuery, selectedDesignation, selectedEmployee, statusFilter]);

  const fetchDepartments = async () => {
    try {
      const response = await api.getDepartments();
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchDesignations = async (deptId: string) => {
    try {
      const response = await api.getDesignations(deptId);
      if (response.success) {
        setDesignations(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching designations:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.getEmployees();
      if (response.success) {
        setEmployees(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchPayrollRecords = async () => {
    if (!selectedMonth) return;

    setLoading(true);
    try {
      const params: any = { month: selectedMonth };
      if (selectedDepartment) params.departmentId = selectedDepartment;

      const response = await api.getPayrollRecords(params);
      if (response.success) {
        setPayrollRecords(response.data || []);
      }
    } catch (error: any) {
      console.error('Error fetching payroll records:', error);
      toast.error(error.message || 'Failed to fetch payroll records');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...payrollRecords];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(record => {
        const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
        return (
          record.emp_no.toLowerCase().includes(query) ||
          employee?.employee_name.toLowerCase().includes(query)
        );
      });
    }

    // Designation filter
    if (selectedDesignation) {
      filtered = filtered.filter(record => {
        const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
        const designationId = typeof employee?.designation_id === 'object'
          ? employee.designation_id._id
          : employee?.designation_id;
        return designationId === selectedDesignation;
      });
    }

    // Employee filter
    if (selectedEmployee) {
      filtered = filtered.filter(record => {
        const empId = typeof record.employeeId === 'object' ? record.employeeId._id : record.employeeId;
        return empId === selectedEmployee;
      });
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(record => record.status === statusFilter);
    }

    setFilteredRecords(filtered);
    setCurrentPage(1);
  };

  const getDeptName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return departments.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const getDesigName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return designations.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const drawPayslipOnDoc = (doc: jsPDF, record: PayrollRecord) => {
    const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
    if (!employee) return false;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Company Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYSLIP', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    let monthLabel = `Month: ${record.monthName}`;
    if (record.startDate && record.endDate) {
      const startStr = new Date(record.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const endStr = new Date(record.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      monthLabel += ` (${startStr} to ${endStr})`;
    }
    doc.text(monthLabel, pageWidth / 2, 28, { align: 'center' });

    // Employee Details Box
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLOYEE DETAILS', 14, 40);

    doc.setFont('helvetica', 'normal');
    const col1X = 14;
    const col2X = 80;
    const col3X = 145;

    let yPos = 48;

    // Row 1
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Code:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(record.emp_no || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Department:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(getDeptName(employee.department_id), col2X + 25, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Location:', col3X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.location || 'N/A', col3X + 20, yPos);

    yPos += 7;

    // Row 2
    doc.setFont('helvetica', 'bold');
    doc.text('Name:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.employee_name || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Designation:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(getDesigName(employee.designation_id), col2X + 25, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Bank Acc:', col3X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.bank_account_no || 'N/A', col3X + 20, yPos);

    yPos += 7;

    // Row 3
    doc.setFont('helvetica', 'bold');
    doc.text('PF Number:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.pf_number || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('ESI Number:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.esi_number || 'N/A', col2X + 25, yPos);

    yPos += 5;

    // Attendance Details
    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('ATTENDANCE DETAILS', 14, yPos);
    yPos += 6;

    const attendanceData = [
      ['Month Days', record.totalDaysInMonth || record.attendance?.totalDaysInMonth || 0],
      ['Present Days', record.attendance?.presentDays || 0],
      ['Week Offs', record.attendance?.weeklyOffs || 0],
      ['Paid Leaves', record.attendance?.paidLeaveDays || 0],
      ['OD Days', record.attendance?.odDays || 0],
      ['Absents', record.attendance?.absentDays || 0],
      ['Payable Shifts', record.totalPayableShifts || record.attendance?.payableShifts || 0],
      ['Extra Days', record.attendance?.extraDays || 0],
      ['Total Paid Days', record.attendance?.totalPaidDays || 0],
      ['OT Hours', record.attendance?.otHours || 0],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Attendance Type', 'Days/Hours']],
      body: attendanceData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129], fontSize: 9, fontStyle: 'bold' }, // emerald-500
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Earnings and Deductions Side by Side
    doc.setFont('helvetica', 'bold');
    doc.text('EARNINGS', 14, yPos);
    doc.text('DEDUCTIONS', pageWidth / 2 + 7, yPos);
    yPos += 6;

    // Earnings Table
    const earningsData = [
      ['Basic Pay', record.earnings.basicPay.toFixed(2)],
      ['Earned Salary', record.attendance?.earnedSalary?.toFixed(2) || '0.00'],
      ...(record.earnings.allowances || []).map(a => [a.name, a.amount.toFixed(2)]),
      ['Incentive', record.earnings.incentive.toFixed(2)],
      ['OT Pay', record.earnings.otPay.toFixed(2)],
      ['Arrears', (record.arrearsAmount || 0).toFixed(2)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Earnings', 'Amount (₹)']],
      body: earningsData,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], fontSize: 9, fontStyle: 'bold' }, // emerald-600
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 14, right: pageWidth / 2 + 7 }
    });

    // Deductions Table
    const deductionsData = [
      ['Attendance Deduction', record.deductions.attendanceDeduction.toFixed(2)],
      ['Permission Deduction', record.deductions.permissionDeduction.toFixed(2)],
      ['Leave Deduction', record.deductions.leaveDeduction.toFixed(2)],
      ...(record.deductions.otherDeductions || []).map(d => [d.name, d.amount.toFixed(2)]),
      ['EMI', record.loanAdvance.totalEMI.toFixed(2)],
      ['Advance', record.loanAdvance.advanceDeduction.toFixed(2)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Deductions', 'Amount (₹)']],
      body: deductionsData,
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72], fontSize: 9, fontStyle: 'bold' }, // rose-600
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: pageWidth / 2 + 7, right: 14 }
    });

    const finalY = Math.max((doc as any).lastAutoTable.finalY, yPos + 40);

    // Summary
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const summaryY = finalY + 10;
    doc.text('SALARY SUMMARY', 14, summaryY);

    doc.setFontSize(10);
    doc.text('Gross Salary:', 14, summaryY + 8);
    doc.text(`₹ ${record.earnings.grossSalary.toFixed(2)}`, 80, summaryY + 8);

    doc.text('Total Deductions:', 14, summaryY + 15);
    doc.text(`₹ ${record.deductions.totalDeductions.toFixed(2)}`, 80, summaryY + 15);

    if (record.roundOff !== undefined) {
      doc.text('Round Off:', 14, summaryY + 22);
      doc.text(`₹ ${record.roundOff.toFixed(2)}`, 80, summaryY + 22);
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NET SALARY:', 14, summaryY + 32);
    doc.text(`₹ ${record.netSalary.toFixed(2)}`, 80, summaryY + 32);

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a computer-generated payslip and does not require a signature.', pageWidth / 2, pageHeight - 10, { align: 'center' });

    return true;
  };

  const generatePayslipPDF = async (record: PayrollRecord) => {
    setGeneratingPDF(true);
    toast.info('Generating payslip PDF...', { autoClose: 1000 });
    try {
      const doc = new jsPDF();
      const success = drawPayslipOnDoc(doc, record);
      if (success) {
        doc.save(`Payslip_${record.emp_no}_${record.month}.pdf`);
        toast.success('Payslip PDF generated successfully!');
      } else {
        toast.error('Employee data not found');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate payslip PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generateBulkPayslipsPDF = async () => {
    if (selectedRecords.size === 0) {
      toast.warning('Please select at least one payslip to export');
      return;
    }

    setGeneratingBulkPDF(true);
    toast.info(`Generating ${selectedRecords.size} payslip(s)...`, { autoClose: 2000 });
    try {
      const recordsToExport = filteredRecords.filter(r => selectedRecords.has(r._id));
      const doc = new jsPDF();
      let addedPages = 0;

      for (let i = 0; i < recordsToExport.length; i++) {
        const record = recordsToExport[i];
        if (addedPages > 0) doc.addPage();

        const success = drawPayslipOnDoc(doc, record);
        if (success) {
          addedPages++;
        }
      }

      if (addedPages > 0) {
        doc.save(`Bulk_Payslips_${selectedMonth}.pdf`);
        toast.success(`${addedPages} payslips exported successfully!`);
        setSelectedRecords(new Set());
      } else {
        toast.error('No valid payslips found to export');
      }
    } catch (error) {
      console.error('Error generating bulk PDF:', error);
      toast.error('Failed to generate bulk payslips');
    } finally {
      setGeneratingBulkPDF(false);
    }
  };

  const toggleSelectRecord = (recordId: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r._id)));
    }
  };

  // Pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredRecords.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);

  return (
    <div className="min-h-screen p-6">
      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">
            Employee Payslips
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            View, search, and export employee payslips
          </p>
        </div>

        {/* Filters Section */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Month Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm"
                  required
                />
              </div>

              {/* Department Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Department
                </label>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm appearance-none cursor-pointer"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              {/* Designation Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Designation
                </label>
                <select
                  value={selectedDesignation}
                  onChange={(e) => setSelectedDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm appearance-none cursor-pointer"
                >
                  <option value="">All Designations</option>
                  {designations.map(desig => (
                    <option key={desig._id} value={desig._id}>{desig.name}</option>
                  ))}
                </select>
              </div>

              {/* Employee Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Employee
                </label>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm appearance-none cursor-pointer"
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp._id} value={emp._id}>
                      {emp.emp_no} - {emp.employee_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm appearance-none cursor-pointer"
                >
                  <option value="">All Status</option>
                  <option value="calculated">Calculated</option>
                  <option value="approved">Approved</option>
                  <option value="processed">Processed</option>
                </select>
              </div>

              {/* Search Bar */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Search
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Emp ID or Name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm"
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 min-w-fit">
              <button
                onClick={fetchPayrollRecords}
                disabled={!selectedMonth || loading}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Fetch
              </button>

              <button
                onClick={generateBulkPayslipsPDF}
                disabled={selectedRecords.size === 0 || generatingBulkPDF}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {generatingBulkPDF ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                Export ({selectedRecords.size})
              </button>

              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedDepartment('');
                  setSelectedDesignation('');
                  setSelectedEmployee('');
                  setStatusFilter('');
                }}
                className="h-10 w-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl transition-all"
                title="Clear Filters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Results Summary */}
        {filteredRecords.length > 0 && (
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Found {filteredRecords.length} payslip(s) • {selectedRecords.size} selected
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Page {currentPage} of {totalPages}
            </div>
          </div>
        )}

        {/* Payslips Table */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === currentRecords.length && currentRecords.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dept / Desig</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Month</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Earnings</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Deductions</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Net Salary</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="animate-spin h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Loading records...</span>
                      </div>
                    </td>
                  </tr>
                ) : currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-slate-200 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>{selectedMonth ? 'No payslips found.' : 'Select a month to begin.'}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((record) => {
                    const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
                    return (
                      <tr
                        key={record._id}
                        onClick={() => router.push(`/payslips/${record._id}`)}
                        className="hover:bg-emerald-50/50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record._id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectRecord(record._id);
                            }}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {employee?.employee_name || 'N/A'}
                            </span>
                            <span className="text-xs text-slate-500 font-mono tracking-tighter">
                              {record.emp_no}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                              {getDeptName(employee?.department_id)}
                            </span>
                            <span className="text-xs text-slate-500">
                              {getDesigName(employee?.designation_id)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {record.monthName} {record.year}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            ₹{record.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                            ₹{record.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">
                          <span className="text-sm font-bold">
                            ₹{record.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${record.status === 'processed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            record.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/payslips/${record._id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-lg transition-all"
                              title="View Details"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generatePayslipPDF(record);
                              }}
                              disabled={generatingPDF}
                              className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-lg transition-all"
                              title="Download PDF"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-sm text-sm font-medium transition-all"
              >
                Previous
              </button>
              <div className="flex gap-2">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${currentPage === i + 1
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                      }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-sm text-sm font-medium transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}