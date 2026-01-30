'use client';

import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import Link from 'next/link';
import { api, Division, Department, Designation } from '@/lib/api';
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
    attendanceDeductionBreakdown?: { daysDeducted?: number };
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

export default function PayslipsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<PayrollRecord[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
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

    setSelectedMonth(defaultMonth);

    fetchDivisions();
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
  }, [selectedMonth, selectedDepartment, selectedDivision]);

  useEffect(() => {
    applyFilters();
  }, [payrollRecords, searchQuery, selectedDesignation, selectedEmployee, statusFilter]);

  const fetchDivisions = async () => {
    try {
      const response = await api.getDivisions();
      if (response.success) {
        setDivisions(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching divisions:', error);
    }
  };

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
      if (selectedDivision) params.divisionId = selectedDivision;
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
    const primaryColor: [number, number, number] = [30, 41, 59];
    const lightBg: [number, number, number] = [248, 250, 252];
    const borderColor: [number, number, number] = [226, 232, 240];

    const formatCurr = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatValue = (val: number) => `Rs. ${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Page border
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.2);
    doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

    // Header: PAYSLIP + period
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(10, 15, 2, 15, 'F');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYSLIP', 16, 24);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    let periodLabel = `${record.monthName} ${record.year}`;
    if (record.startDate && record.endDate) {
      const startStr = new Date(record.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const endStr = new Date(record.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      periodLabel += ` | ${startStr} - ${endStr}`;
    }
    doc.text(periodLabel, 16, 30);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('PRIVATE & CONFIDENTIAL', pageWidth - 15, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Ref: ${record._id.toString().slice(-8).toUpperCase()}`, pageWidth - 15, 27, { align: 'right' });

    // Summary cards row
    let yPos = 40;
    const cardWidth = (pageWidth - 30) / 3;
    const cardHeight = 20;
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(10, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('GROSS EARNINGS', 14, yPos + 7);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(formatValue(record.earnings.grossSalary), 14, yPos + 15);

    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(15 + cardWidth, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL DEDUCTIONS', 15 + cardWidth + 4, yPos + 7);
    doc.setFontSize(11);
    doc.setTextColor(190, 18, 60);
    doc.text(formatValue(record.deductions.totalDeductions), 15 + cardWidth + 4, yPos + 15);

    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.roundedRect(20 + cardWidth * 2, yPos, cardWidth, cardHeight, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(209, 213, 219);
    doc.text('NET PAYABLE', 20 + cardWidth * 2 + 4, yPos + 7);
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(formatValue(record.netSalary), 20 + cardWidth * 2 + 4, yPos + 15);

    // EMPLOYEE DETAILS
    yPos += 35;
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLOYEE DETAILS', 14, yPos);
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const col1 = 14, col2 = 70, col3 = 120;
    doc.text(`Name ${employee.employee_name || 'N/A'}`, col1, yPos);
    doc.text(`Employee ID ${record.emp_no || 'N/A'}`, col2, yPos);
    doc.text(`Designation ${getDesigName(employee.designation_id)}`, col3, yPos);
    yPos += 5;
    doc.text(`Department ${getDeptName(employee.department_id)}`, col1, yPos);
    doc.text(`Bank Account ${employee.bank_account_no || 'N/A'}`, col2, yPos);
    doc.text(`Location ${employee.location || 'N/A'}`, col3, yPos);
    yPos += 5;
    doc.text(`PAN Number ${(employee as any).pan_number || 'N/A'}`, col1, yPos);
    doc.text(`UAN Number ${(employee as any).uan_number || 'N/A'}`, col2, yPos);

    // ATTENDANCE SUMMARY (no background, bold title and labels)
    yPos += 12;
    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('ATTENDANCE SUMMARY', 14, yPos);

    yPos += 8;
    const attDedDays = record.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? 0;
    const totalPaid = record.attendance?.totalPaidDays ?? 0;
    const finalPaid = Math.max(0, totalPaid - attDedDays);
    const monthDays = record.totalDaysInMonth || record.attendance?.totalDaysInMonth || 0;
    const presentDays = record.attendance?.presentDays || 0;
    const paidLeaves = record.attendance?.paidLeaveDays || 0;
    const totalLeaves = (record.attendance as any)?.totalLeaveDays ?? paidLeaves + ((record.attendance as any)?.totalLopDays ?? 0);
    const absents = record.attendance?.absentDays ?? 0;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    let x = 14;
    doc.setFont('helvetica', 'bold');
    doc.text('Month Days: ', x, yPos); x += doc.getTextWidth('Month Days: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(monthDays), x, yPos); x += doc.getTextWidth(String(monthDays)) + 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Present Days: ', x, yPos); x += doc.getTextWidth('Present Days: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(presentDays), x, yPos); x += doc.getTextWidth(String(presentDays)) + 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Paid Leaves: ', x, yPos); x += doc.getTextWidth('Paid Leaves: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(paidLeaves), x, yPos); x += doc.getTextWidth(String(paidLeaves)) + 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Paid Days: ', x, yPos); x += doc.getTextWidth('Total Paid Days: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(totalPaid), x, yPos);
    yPos += 6;
    x = 14;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Leaves: ', x, yPos); x += doc.getTextWidth('Total Leaves: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(totalLeaves), x, yPos); x += doc.getTextWidth(String(totalLeaves)) + 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Absents: ', x, yPos); x += doc.getTextWidth('Absents: ');
    doc.setFont('helvetica', 'normal');
    doc.text(String(absents), x, yPos);
    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text('Attendance Deduction Days (Late): ', 14, yPos);
    const attDedX = doc.getTextWidth('Attendance Deduction Days (Late): ') + 14;
    doc.setFont('helvetica', 'bold');
    doc.text(String(attDedDays), attDedX, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(22, 101, 52);
    doc.text(`    |    Final Paid Days: ${finalPaid}`, attDedX + 12, yPos);

    // EARNINGS & DEDUCTIONS TABLES (with totals)
    yPos += 12;
    const earningsBody = [
      ['Basic Pay', formatCurr(record.earnings.basicPay)],
      ['Earned Basic', formatCurr(record.attendance?.earnedSalary || 0)],
      ...(record.earnings.allowances || []).map(a => [a.name, formatCurr(a.amount)]),
      ['Extra Days Pay', formatCurr(record.earnings.incentive)],
      ['OT Pay', formatCurr(record.earnings.otPay)],
      ['Arrears', formatCurr(record.arrearsAmount || 0)],
    ];
    autoTable(doc, {
      startY: yPos,
      head: [['EARNINGS', 'AMOUNT']],
      body: earningsBody,
      foot: [['TOTAL EARNINGS', formatCurr(record.earnings.grossSalary)]],
      theme: 'plain',
      headStyles: { fontStyle: 'bold', textColor: primaryColor, fontSize: 8, cellPadding: 2 },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2 },
      footStyles: { fontStyle: 'bold', textColor: primaryColor, fontSize: 9, cellPadding: 3, fillColor: [248, 250, 252] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 10, right: pageWidth / 2 + 2 },
    });

    const deductionsBody = [
      ['Attendance Deduction', formatCurr(record.deductions.attendanceDeduction)],
      ['Permission Deduction', formatCurr(record.deductions.permissionDeduction)],
      ['Leave Deduction', formatCurr(record.deductions.leaveDeduction)],
      ...(record.deductions.otherDeductions || []).map(d => [d.name, formatCurr(d.amount)]),
      ['EMI Deduction', formatCurr(record.loanAdvance.totalEMI)],
      ['Advance Deduction', formatCurr(record.loanAdvance.advanceDeduction)],
    ];
    autoTable(doc, {
      startY: yPos,
      head: [['DEDUCTIONS', 'AMOUNT']],
      body: deductionsBody,
      foot: [['TOTAL DEDUCTIONS', formatCurr(record.deductions.totalDeductions)]],
      theme: 'plain',
      headStyles: { fontStyle: 'bold', textColor: [190, 18, 60], fontSize: 8, cellPadding: 2 },
      bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2 },
      footStyles: { fontStyle: 'bold', textColor: [190, 18, 60], fontSize: 9, cellPadding: 3, fillColor: [255, 241, 242] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: pageWidth / 2 + 2, right: 10 },
    });

    yPos = Math.max((doc as any).lastAutoTable.finalY + 15, yPos + 60);

    // NET PAYABLE IN WORDS
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(10, yPos, pageWidth - 20, 25, 2, 2, 'F');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('NET PAYABLE IN WORDS', 16, yPos + 8);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`Total amount of: ${formatValue(record.netSalary)} (Approx INR)`, 16, yPos + 16);
    if (record.roundOff !== 0 && record.roundOff !== undefined) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text(`* Adjusted by ${formatValue(record.roundOff)} round-off`, pageWidth - 15, yPos + 22, { align: 'right' });
    }

    // Signature blocks
    yPos += 45;
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(0.5);
    doc.line(20, yPos, 70, yPos);
    doc.line(pageWidth - 70, yPos, pageWidth - 20, yPos);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Employee Signature', 45, yPos + 5, { align: 'center' });
    doc.text('Authorized Signatory', pageWidth - 45, yPos + 5, { align: 'center' });

    // Footer
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text('This is a computer-generated document and does not require a physical signature.', pageWidth / 2, pageHeight - 12, { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

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
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
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

              {/* Division Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Division
                </label>
                <select
                  value={selectedDivision}
                  onChange={(e) => {
                    setSelectedDivision(e.target.value);
                    setSelectedDepartment(''); // Reset department
                    setSelectedDesignation(''); // Reset designation
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white text-sm appearance-none cursor-pointer"
                >
                  <option value="">All Divisions</option>
                  {divisions.map(div => (
                    <option key={div._id} value={div._id}>{div.name}</option>
                  ))}
                </select>
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
                  {departments
                    .filter(dept => {
                      if (!selectedDivision) return true;
                      const currentDiv = divisions.find(d => d._id === selectedDivision);
                      return currentDiv?.departments?.some((d: any) => d === dept._id || d._id === dept._id);
                    })
                    .map(dept => (
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
                  setSelectedDivision('');
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
                        onClick={() => router.push(`/superadmin/payslips/${record._id}`)}
                        className="hover:bg-emerald-50/50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record._id)}
                            onChange={(e) => {
                              e.stopPropagation(); // Prevent row click when clicking checkbox
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
                              href={`/superadmin/payslips/${record._id}`}
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
              <div className="flex gap-1 md:gap-2">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`min-w-[40px] h-10 px-2 rounded-xl text-sm font-medium transition-all ${currentPage === i + 1
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
